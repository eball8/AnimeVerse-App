
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  Bell,
  Heart,
  MessageCircle,
  UserPlus,
  Megaphone,
  ShieldAlert,
} from 'lucide-react';

import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  markAllRead,
  subscribeNotifications,
} from '../services/notificationService';
import type {
  AppNotification,
  NotificationType,
} from '../services/notificationService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { timeAgo } from '../utils/timeAgo';
import Avatar from '../components/Avatar';

const icons: Record<NotificationType, typeof Bell> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  request: UserPlus,
  new_device: ShieldAlert,
};

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [anns, setAnns] = useState<any[]>([]);
  const marked = useRef(false);

  const briefs = useUserBriefs(items.map((n) => n.fromUid));

  useEffect(() => {
    if (!user) {
      setItems([]);
      marked.current = false;
      return;
    }

    const unsub = subscribeNotifications(user.uid, (list) => {
      setItems(list);

      if (!marked.current && list.length > 0) {
        marked.current = true;
        markAllRead(list).catch((error) => {
          console.error('Failed to mark notifications as read:', error);
        });
      }
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    getDocs(
      query(
        collection(db, 'announcements'),
        orderBy('createdAt', 'desc'),
        limit(5)
      )
    )
      .then((snapshot) => {
        if (cancelled) return;

        const announcements = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a: any) => a.active !== false);

        setAnns(announcements);
      })
      .catch((error) => {
        console.error('Failed to load announcements:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openNotification = (notification: AppNotification) => {
    if (
      notification.type === 'follow' ||
      notification.type === 'request'
    ) {
      navigate(`/user/${notification.fromUid}`);
      return;
    }

    if (
      notification.type !== 'new_device' &&
      notification.postId
    ) {
      navigate(`/post/${notification.postId}`);
    }
  };

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">
          {t('header.notifications')}
        </h2>
      </div>

      {anns.map((announcement) => (
        <div
          key={announcement.id}
          className="card p-4 flex gap-3 border-primary-500/30 bg-primary-500/10"
        >
          <Megaphone className="w-5 h-5 text-primary-400 shrink-0" />

          <div className="min-w-0">
            <p className="text-sm font-black text-white">
              {announcement.title}
            </p>
            <p className="text-xs text-slate-300 mt-1 break-words">
              {announcement.body}
            </p>
          </div>
        </div>
      ))}

      {items.length === 0 && anns.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-16">
          {t('notif.empty')}
        </p>
      )}

      <div className="space-y-2">
        {items.map((notification) => {
          const Icon = icons[notification.type] || Bell;

          const author = pickAuthor(
            briefs,
            notification.fromUid,
            notification.fromName,
            notification.fromPhotoURL
          );

          const isSecurity =
            notification.type === 'new_device';

          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => openNotification(notification)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-start ${
                notification.read
                  ? 'bg-white/5 border-white/10'
                  : 'bg-primary-500/10 border-primary-500/30'
              }`}
            >
              {isSecurity ? (
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/15 shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                </div>
              ) : (
                <Avatar
                  src={author.photo}
                  seed={notification.fromUid}
                  name={author.name}
                  className="w-10 h-10 rounded-full object-cover bg-dark-900 shrink-0"
                />
              )}

              <div className="flex-1 min-w-0">
                {isSecurity && (
                  <p className="text-xs font-bold text-amber-400 mb-1">
                    تنبيه أمني
                  </p>
                )}

                <p className="text-xs text-white break-words">
                  <b>
                    {isSecurity ? 'أمان الحساب' : author.name}
                  </b>{' '}
                  {notification.text}
                </p>

                <p className="text-[10px] text-slate-500 mt-0.5">
                  {timeAgo(notification.createdAt, lang)}
                </p>
              </div>

              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isSecurity
                    ? 'text-amber-400'
                    : 'text-primary-400'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Notifications;
