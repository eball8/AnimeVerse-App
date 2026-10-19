import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Bell, Heart, MessageCircle, UserPlus, Megaphone } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { markAllRead, subscribeNotifications } from '../services/notificationService';
import type { AppNotification } from '../services/notificationService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';
import Avatar from '../components/Avatar';

const icons = { like: Heart, comment: MessageCircle, follow: UserPlus, request: UserPlus } as const;

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [anns, setAnns] = useState<any[]>([]);
  const marked = useRef(false);
  const briefs = useUserBriefs(items.map((n) => n.fromUid));

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeNotifications(user.uid, (list) => {
      setItems(list);
      if (!marked.current && list.length) {
        marked.current = true;
        markAllRead(list).catch(console.error);
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(5)))
      .then((s) => setAnns(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a: any) => a.active !== false)))
      .catch((e) => console.error(e));
  }, []);

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">{t('header.notifications')}</h2>
      </div>

      {anns.map((a) => (
        <div key={a.id} className="card p-4 flex gap-3 border-primary-500/30 bg-primary-500/10">
          <Megaphone className="w-5 h-5 text-primary-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-black text-white">{a.title}</p>
            <p className="text-xs text-slate-300 mt-1 break-words">{a.body}</p>
          </div>
        </div>
      ))}

      {items.length === 0 && anns.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-16">{t('notif.empty')}</p>
      )}

      <div className="space-y-2">
        {items.map((n) => {
          const Icon = icons[n.type] || Bell;
          const a = pickAuthor(briefs, n.fromUid, n.fromName, n.fromPhotoURL);
          return (
            <button
              key={n.id}
              onClick={() =>
                n.type === 'follow' || n.type === 'request'
                  ? navigate(`/user/${n.fromUid}`)
                  : n.postId && navigate(`/post/${n.postId}`)
              }
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-start ${n.read ? 'bg-white/5 border-white/10' : 'bg-primary-500/10 border-primary-500/30'}`}
            >
              <Avatar src={a.photo} seed={n.fromUid} name={a.name} className="w-10 h-10 rounded-full object-cover bg-dark-900 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white break-words"><b>{a.name}</b> {n.text}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{timeAgo(n.createdAt, lang)}</p>
              </div>
              <Icon className="w-4 h-4 text-primary-400 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Notifications;
