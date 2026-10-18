import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABELS, getLibItem, saveLibItem } from '../services/libraryService';
import type { LibStatus } from '../services/libraryService';

interface Props {
  animeId: string;
  title: string;
  imageUrl: string;
}

const LibraryControls: React.FC<Props> = ({ animeId, title, imageUrl }) => {
  const { user } = useAuth();
  const [favorite, setFavorite] = useState(false);
  const [status, setStatus] = useState<LibStatus>('none');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    getLibItem(user.uid, animeId)
      .then((i) => { if (i) { setFavorite(i.favorite); setStatus(i.status); } })
      .catch((e) => console.error(e));
  }, [user, animeId]);

  const save = async (fav: boolean, st: LibStatus) => {
    if (!user || busy) return;
    const prev = { favorite, status };
    setFavorite(fav); setStatus(st); setBusy(true);
    try {
      await saveLibItem(user.uid, { animeId, title, imageUrl }, fav, st);
    } catch (e: any) {
      setFavorite(prev.favorite); setStatus(prev.status);
      alert('تعذّر الحفظ: ' + (e?.message || ''));
    }
    setBusy(false);
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => save(!favorite, status)}
        className={`p-2.5 rounded-xl border active:scale-95 ${favorite ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-slate-400'}`}
        aria-label="المفضلة"
      >
        <Heart className={`w-5 h-5 ${favorite ? 'fill-red-400' : ''}`} />
      </button>
      <select
        value={status}
        onChange={(e) => save(favorite, e.target.value as LibStatus)}
        className="flex-1 px-3 py-2.5 rounded-xl bg-dark-900 border border-white/10 text-xs font-bold text-white"
      >
        {(Object.keys(STATUS_LABELS) as LibStatus[]).map((k) => (
          <option key={k} value={k}>{STATUS_LABELS[k]}</option>
        ))}
      </select>
    </div>
  );
};

export default LibraryControls;
