import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listLibrary } from '../services/libraryService';
import { useI18n } from '../i18n/I18nContext';
import type { LibItem, LibStatus } from '../services/libraryService';

type Tab = 'favorite' | Exclude<LibStatus, 'none'>;

const Library: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('favorite');

  useEffect(() => {
    if (!user) return;
    listLibrary(user.uid)
      .then(setItems)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [user]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'favorite', label: t('lib.favorites') },
    { id: 'watching', label: t('lib.status.watching') },
    { id: 'planned', label: t('lib.status.planned') },
    { id: 'completed', label: t('lib.status.completed') },
    { id: 'dropped', label: t('lib.status.dropped') },
  ];
  const shown = items.filter((i) => (tab === 'favorite' ? i.favorite : i.status === tab));

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Bookmark className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">{t('profile.library')}</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${tab === tb.id ? 'bg-primary-500/20 text-primary-400' : 'text-slate-500'}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto my-10" />
      ) : shown.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-16">{t('lib.empty')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {shown.map((i) => (
            <button key={i.id} onClick={() => navigate(`/anime/${i.animeId}`)} className="text-right active:scale-95 transition-transform">
              <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-dark-900 border border-white/5">
                <img src={i.imageUrl} alt={i.title} loading="lazy" className="w-full h-full object-cover" />
              </div>
              <p className="text-[11px] font-bold text-white line-clamp-1 mt-1 px-1">{i.title}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Library;
