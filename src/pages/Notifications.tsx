import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Flag,
  Heart,
  MessageCircle,
  UserPlus,
  Megaphone,
  PartyPopper,
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
import { markReportNotifsRead } from '../services/reportService';
import { ackMessage, outcomeFor, repliedTitle } from '../services/reportMessages';
import type { OutcomeTone } from '../services/reportMessages';
import { useReportTickets } from '../hooks/useReportTickets';
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

// نصوص الإشعارات تُحفظ في Firestore بالعربية؛ نحوّلها إلى مفتاح ترجمة عند العرض
// حتى تظهر بلغة التطبيق الحالية (يعمل مع الإشعارات القديمة والجديدة معاً).
const EXACT_TEXT_KEYS: Record<string, string> = {
  'أعجب بمنشورك': 'notif.liked',
  'أعجب بتعليقك': 'notif.commentLiked',
  'أعاد نشر منشورك': 'notif.reposted',
  'أشار إليك في منشور': 'notif.mentioned',
  'شاركك في منشور تعاوني': 'notif.collab',
  'قبل دعوتك للتعاون في منشور': 'notif.collabAccepted',
  'أشار إليك في تعليق': 'notif.mentionedComment',
  'بدأ بمتابعتك': 'notif.followed',
  'أرسل لك طلب متابعة': 'notif.requested',
};
const COMMENT_PREFIX = 'علّق على منشورك: ';
const REPLY_PREFIX = 'ردّ على تعليقك: ';
const DEVICE_PREFIX = 'تم تسجيل الدخول من جهاز جديد: ';
const UNKNOWN_DEVICE_AR = 'جهاز غير معروف';

// إشعارات حالة الحساب (إنذار / تقييد / إغلاق) يرسلها الأدمن، ونصها يكون mod:<code>
const MOD_TYPE = 'moderation';
const MOD_PREFIX = 'mod:';
const MOD_DANGER_CODES = ['danger', 'restrict', 'ban'];

// إشعارات البلاغات (استلام البلاغ + ردّ الإدارة): تُبنى من تذاكر هذا الجهاز
interface ReportEntry {
  key: string;
  ms: number;
  title: string;
  text: string;
  unread: boolean;
  tone: OutcomeTone;
}

type FeedItem =
  | { kind: 'n'; ms: number; n: AppNotification }
  | { kind: 'r'; ms: number; r: ReportEntry };

const REPORT_TONE: Record<OutcomeTone, { bg: string; icon: string; title: string }> = {
  pending: { bg: 'bg-amber-500/15', icon: 'text-amber-400', title: 'text-amber-400' },
  action: { bg: 'bg-emerald-500/15', icon: 'text-emerald-400', title: 'text-emerald-400' },
  none: { bg: 'bg-slate-500/20', icon: 'text-slate-300', title: 'text-slate-300' },
};

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const { t, lang } = useI18n();

  const localizeText = (n: AppNotification): string => {
    const raw = (n.text || '').trim();
    if (raw.startsWith(MOD_PREFIX)) {
      return t(`as.notif.${raw.slice(MOD_PREFIX.length)}`);
    }
    const key = EXACT_TEXT_KEYS[raw];
    if (key) return t(key);
    if (raw.startsWith(COMMENT_PREFIX)) {
      return t('notif.commented', { text: raw.slice(COMMENT_PREFIX.length) });
    }
    if (raw.startsWith(REPLY_PREFIX)) {
      return t('notif.repliedComment', { text: raw.slice(REPLY_PREFIX.length) });
    }
    if (raw.startsWith(DEVICE_PREFIX)) {
      const device = raw.slice(DEVICE_PREFIX.length);
      return t('notif.newDevice', {
        device: device === UNKNOWN_DEVICE_AR ? t('notif.unknownDevice') : device,
      });
    }
    return raw;
  };
  const navigate = useNavigate();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [anns, setAnns] = useState<any[]>([]);
  const marked = useRef(false);
  const tickets = useReportTickets(true);
  const keepUnread = useRef<Set<string>>(new Set());

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

  const reportEntries = useMemo<ReportEntry[]>(() => {
    const out: ReportEntry[] = [];
    for (const tk of tickets) {
      // التذاكر القديمة (قبل هذه الميزة) لا تُنشئ إشعار «تم الاستلام»
      if (tk.ackRead !== undefined) {
        const ack = ackMessage(lang);
        out.push({
          key: `${tk.id}:ack`,
          ms: tk.createdAt,
          title: ack.title,
          text: ack.text,
          unread: tk.ackRead === false,
          tone: 'pending',
        });
      }
      if (tk.status && tk.replyRead !== undefined) {
        const o = outcomeFor(lang, tk);
        out.push({
          key: `${tk.id}:reply`,
          ms: tk.repliedAt ?? tk.createdAt,
          title: repliedTitle(lang),
          text: o.text,
          unread: tk.replyRead === false,
          tone: o.tone,
        });
      }
    }
    return out;
  }, [tickets, lang]);

  // نُبقي التمييز ظاهراً أثناء وجودك في الصفحة ثم نضع علامة «مقروء»
  useEffect(() => {
    let any = false;
    reportEntries.forEach((e) => {
      if (e.unread) {
        keepUnread.current.add(e.key);
        any = true;
      }
    });
    if (any) markReportNotifsRead();
  }, [reportEntries]);

  const feed = useMemo<FeedItem[]>(() => {
    const list: FeedItem[] = [
      ...items.map((n) => ({
        kind: 'n' as const,
        ms: n.createdAt?.toMillis?.() ?? Date.now(),
        n,
      })),
      ...reportEntries.map((r) => ({ kind: 'r' as const, ms: r.ms, r })),
    ];
    return list.sort((a, b) => b.ms - a.ms);
  }, [items, reportEntries]);

  const openNotification = (notification: AppNotification) => {
    if (String(notification.type) === MOD_TYPE) {
      navigate('/account-status');
      return;
    }

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

  const renderReport = (r: ReportEntry) => {
    const hot = r.unread || keepUnread.current.has(r.key);
    const tone = REPORT_TONE[r.tone];

    return (
      <button
        key={r.key}
        type="button"
        onClick={() => navigate('/my-reports')}
        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-start ${
          hot
            ? 'bg-primary-500/10 border-primary-500/30'
            : 'bg-white/5 border-white/10'
        }`}
      >
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone.bg}`}
        >
          <Flag className={`w-5 h-5 ${tone.icon}`} />
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold mb-1 ${tone.title}`}>{r.title}</p>
          <p className="text-xs text-white break-words">{r.text}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {timeAgo({ toMillis: () => r.ms }, lang)}
          </p>
        </div>
      </button>
    );
  };

  const renderNotification = (notification: AppNotification) => {
    const Icon = icons[notification.type] || Bell;

    const author = pickAuthor(
      briefs,
      notification.fromUid,
      notification.fromName,
      notification.fromPhotoURL
    );

    const isSecurity =
      notification.type === 'new_device';
    const isModeration = String(notification.type) === MOD_TYPE;
    const isSystem = isSecurity || isModeration;
    const modCode = (notification.text || '').startsWith(MOD_PREFIX)
      ? notification.text.slice(MOD_PREFIX.length)
      : '';
    const isDanger = isModeration && MOD_DANGER_CODES.includes(modCode);

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
        {isSystem ? (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              isDanger ? 'bg-red-500/15' : 'bg-amber-500/15'
            }`}
          >
            <ShieldAlert
              className={`w-5 h-5 ${isDanger ? 'text-red-400' : 'text-amber-400'}`}
            />
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
          {isSystem && (
            <p
              className={`text-xs font-bold mb-1 ${
                isDanger ? 'text-red-400' : 'text-amber-400'
              }`}
            >
              {isModeration ? t('as.notifLabel') : t('notif.securityAlert')}
            </p>
          )}

          <p className="text-xs text-white break-words">
            <b>
              {isModeration
                ? t('as.notifFrom')
                : isSecurity
                ? t('notif.accountSecurity')
                : author.name === 'مستخدم'
                ? t('notif.someone')
                : author.name}
            </b>{' '}
            {localizeText(notification)}
          </p>

          <p className="text-[10px] text-slate-500 mt-0.5">
            {timeAgo(notification.createdAt, lang)}
          </p>
        </div>

        <Icon
          className={`w-4 h-4 shrink-0 ${
            isDanger
              ? 'text-red-400'
              : isSystem
              ? 'text-amber-400'
              : 'text-primary-400'
          }`}
        />
      </button>
    );
  };

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">
          {t('header.notifications')}
        </h2>
      </div>

      {anns.map((announcement) => {
        const isUnlock =
          announcement.kind === 'anime_unlocked' && !!announcement.animeId;
        const AnnIcon = isUnlock ? PartyPopper : Megaphone;
        const annTitle = isUnlock
          ? t('lock.annTitle', { title: announcement.animeTitle || '' })
          : announcement.title;
        const annBody = isUnlock ? t('lock.annBody') : announcement.body;

        return (
          <div
            key={announcement.id}
            className="card p-4 flex gap-3 border-primary-500/30 bg-primary-500/10"
          >
            <AnnIcon className="w-5 h-5 text-primary-400 shrink-0" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white">{annTitle}</p>
              <p className="text-xs text-slate-300 mt-1 break-words">
                {annBody}
              </p>
              {isUnlock && (
                <button
                  type="button"
                  onClick={() => navigate(`/anime/${announcement.animeId}`)}
                  className="btn-primary px-4 py-1.5 text-xs font-bold mt-3"
                >
                  {t('lock.watchNow')}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {feed.length === 0 && anns.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-16">
          {t('notif.empty')}
        </p>
      )}

      <div className="space-y-2">
        {feed.map((entry) =>
          entry.kind === 'r' ? renderReport(entry.r) : renderNotification(entry.n)
        )}
      </div>
    </div>
  );
};

export default Notifications;
