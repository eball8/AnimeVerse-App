import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Megaphone, PartyPopper, X } from 'lucide-react';
import { db } from '../config/firebase';
import { useI18n } from '../i18n/I18nContext';

const KEY = 'dismissedAnnouncement';

interface Ann {
  id: string;
  title: string;
  body: string;
  kind?: string;
  animeId?: string;
  animeTitle?: string;
}

const AnnouncementBanner: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ann, setAnn] = useState<Ann | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(5)));
        const first = snap.docs.find((d) => d.data().active !== false);
        if (!first) return;
        let dismissed = '';
        try { dismissed = localStorage.getItem(KEY) || ''; } catch { /* تجاهل */ }
        if (dismissed === first.id) return;
        const d = first.data();
        setAnn({
          id: first.id,
          title: d.title,
          body: d.body,
          kind: d.kind,
          animeId: d.animeId,
          animeTitle: d.animeTitle,
        });
      } catch (e) {
        console.error('announcements failed:', e);
      }
    })();
  }, []);

  if (!ann) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, ann.id); } catch { /* تجاهل */ }
    setAnn(null);
  };

  const isUnlock = ann.kind === 'anime_unlocked' && !!ann.animeId;
  const title = isUnlock ? t('lock.annTitle', { title: ann.animeTitle || '' }) : ann.title;
  const body = isUnlock ? t('lock.annBody') : ann.body;
  const Icon = isUnlock ? PartyPopper : Megaphone;

  const watch = () => {
    const id = ann.animeId;
    dismiss();
    navigate(`/anime/${id}`);
  };

  return (
    <div className="card p-4 flex gap-3 border-primary-500/30 bg-primary-500/10">
      <Icon className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="text-xs text-slate-300 mt-1 break-words">{body}</p>
        {isUnlock && (
          <button onClick={watch} className="btn-primary px-4 py-1.5 text-xs font-bold mt-3">
            {t('lock.watchNow')}
          </button>
        )}
      </div>
      <button onClick={dismiss} className="p-1 text-slate-400 self-start" aria-label={t('wt.close')}><X className="w-4 h-4" /></button>
    </div>
  );
};

export default AnnouncementBanner;
