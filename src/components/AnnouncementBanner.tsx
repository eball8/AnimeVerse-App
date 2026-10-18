import React, { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Megaphone, X } from 'lucide-react';
import { db } from '../config/firebase';

const KEY = 'dismissedAnnouncement';

const AnnouncementBanner: React.FC = () => {
  const [ann, setAnn] = useState<{ id: string; title: string; body: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(5)));
        const first = snap.docs.find((d) => d.data().active !== false);
        if (!first) return;
        let dismissed = '';
        try { dismissed = localStorage.getItem(KEY) || ''; } catch { /* تجاهل */ }
        if (dismissed === first.id) return;
        setAnn({ id: first.id, title: first.data().title, body: first.data().body });
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

  return (
    <div className="card p-4 flex gap-3 border-primary-500/30 bg-primary-500/10">
      <Megaphone className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white">{ann.title}</p>
        <p className="text-xs text-slate-300 mt-1 break-words">{ann.body}</p>
      </div>
      <button onClick={dismiss} className="p-1 text-slate-400 self-start" aria-label="إغلاق"><X className="w-4 h-4" /></button>
    </div>
  );
};

export default AnnouncementBanner;
