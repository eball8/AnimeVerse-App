import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  Search, Link2, Share2, Check, Loader2, AlertCircle, CheckCircle2, PlusCircle,
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { convIdOf, sendDirect } from '../services/chatService';
import type { ChatPayload } from '../services/chatService';
import { uploadVideoToCloudinary } from '../services/cloudinaryService';
import { getMutualFriendIds } from '../services/followService';
import { createStory } from '../services/storyService';
import { useUserBriefs } from '../services/userCache';
import type { Post } from '../services/postService';
import { copyText } from '../utils/links';
import Avatar from './Avatar';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export interface PostShareSheetProps {
  post: Post;
  /** رابط المنشور (postLink أو reelLink) */
  url: string;
  authorName: string;
  onClose: () => void;
}

interface Notice {
  kind: 'ok' | 'err';
  text: string;
}

const MAX_FRIENDS_SHOWN = 100;

/* ------------------------------------------------------------------
   تطبيقات المشاركة الخارجية (صف الأزرار السفلي)
------------------------------------------------------------------ */
const APPS: { id: string; label: string; bg: string; glyph: string; href: (u: string, t: string) => string }[] = [
  {
    id: 'wa',
    label: 'WhatsApp',
    bg: 'bg-[#25D366]',
    glyph: 'W',
    href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t}\n${u}`)}`,
  },
  {
    id: 'tg',
    label: 'Telegram',
    bg: 'bg-[#229ED9]',
    glyph: 'T',
    href: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
  {
    id: 'fb',
    label: 'Facebook',
    bg: 'bg-[#1877F2]',
    glyph: 'f',
    href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    id: 'x',
    label: 'X',
    bg: 'bg-black border border-white/20',
    glyph: 'X',
    href: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
];

const openExternal = async (href: string) => {
  try {
    if (Capacitor.isNativePlatform()) await Browser.open({ url: href });
    else window.open(href, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(href, '_blank');
  }
};

/* ------------------------------------------------------------------
   بطاقة قصة لمنشور نصي (صورة 1080×1920)
------------------------------------------------------------------ */
const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] => {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
      if (lines.length >= maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length >= maxLines) break;
  }
  if (lines.length >= maxLines) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, '')}…`;
  return lines;
};

const renderTextCard = (text: string, authorName: string): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('CANVAS_UNSUPPORTED'));
      return;
    }
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#12061f');
    bg.addColorStop(0.55, '#3b0a5e');
    bg.addColorStop(1, '#a21caf');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 80px sans-serif';
    ctx.fillText('AnimeVerse', W / 2, 260);

    const isRtl = /[\u0590-\u08FF]/.test(text);
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    ctx.font = '800 64px sans-serif';
    const lines = wrapLines(ctx, text.slice(0, 600), 880, 14);
    const lineH = 96;
    let y = H / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln) => {
      ctx.fillText(ln, W / 2, y);
      y += lineH;
    });

    ctx.direction = 'ltr';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 48px sans-serif';
    ctx.fillText(authorName.slice(0, 30), W / 2, H - 220);

    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('BLOB_FAILED'))), 'image/png');
  });

/* ------------------------------------------------------------------
   مساعدات الإرسال
------------------------------------------------------------------ */
const loadMyConversationIds = async (me: string): Promise<Set<string>> => {
  const snap = await getDocs(
    query(collection(db, 'conversations'), where('members', 'array-contains', me), limit(200))
  );
  return new Set(snap.docs.map((d) => d.id));
};

const errorCode = (e: unknown): string => {
  const x = e as { code?: unknown; message?: unknown } | null;
  return String(x?.code ?? x?.message ?? '');
};

const sendErrorText = (e: unknown, t: TFn): string => {
  const c = errorCode(e);
  if (c === 'RECIPIENT_NO_KEY') return t('psh.err.noKey');
  if (c === 'MESSAGES_CLOSED') return t('psh.err.closed');
  if (c === 'NO_LOCAL_KEY') return t('psh.err.noLocalKey');
  if (c.includes('permission-denied')) return t('psh.err.denied');
  return t('psh.err.send');
};

const storyErrorText = (e: unknown, t: TFn): string => {
  const c = errorCode(e);
  if (c.includes('permission-denied')) return t('psh.err.storyDenied');
  if (c === 'CANVAS_UNSUPPORTED' || c === 'BLOB_FAILED') return t('psh.err.storyImage');
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg.trim() ? msg : t('psh.err.story');
};

/* ------------------------------------------------------------------
   زر دائري في الصف السفلي
------------------------------------------------------------------ */
const RoundAction: React.FC<{
  label: string;
  onClick: () => void;
  loading?: boolean;
  done?: boolean;
  disabled?: boolean;
  bg?: string;
  children: React.ReactNode;
}> = ({ label, onClick, loading, done, disabled, bg = 'bg-white/10', children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    className="flex flex-col items-center gap-1.5 w-[72px] shrink-0 active:scale-95 transition disabled:opacity-50"
  >
    <span className={`w-14 h-14 rounded-full flex items-center justify-center text-white ${bg}`}>
      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : done ? <Check className="w-6 h-6 text-emerald-300" /> : children}
    </span>
    <span className="text-[11px] text-slate-300 text-center leading-tight line-clamp-2">{label}</span>
  </button>
);

/* ------------------------------------------------------------------
   النافذة
------------------------------------------------------------------ */
const PostShareSheet: React.FC<PostShareSheetProps> = ({ post, url, authorName, onClose }) => {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const me = user?.uid ?? '';

  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [storyDone, setStoryDone] = useState(false);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState(false);
  const [search, setSearch] = useState('');
  const [sentTo, setSentTo] = useState<Set<string>>(() => new Set());

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const snippet = (post.content || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const shareText = snippet ? `${authorName}: ${snippet}` : authorName;

  const briefs = useUserBriefs(friendIds);

  const flash = (kind: 'ok' | 'err', text: string) => {
    if (alive.current) setNotice({ kind, text });
  };

  // ---- تحميل الأصدقاء عند الفتح ----
  useEffect(() => {
    if (!me) {
      setFriendsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = await getMutualFriendIds(me);
        if (!cancelled) setFriendIds(ids.filter((id) => id !== me).slice(0, 300));
      } catch (e) {
        console.error('friends load failed:', e);
        if (!cancelled) setFriendsError(true);
      } finally {
        if (!cancelled) setFriendsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  // ---- إرسال إلى صديق في المحادثة ----
  const handleSendToFriend = async (friendUid: string) => {
    if (!user || !url || busy || sentTo.has(friendUid)) return;
    setBusy(`send:${friendUid}`);
    setNotice(null);
    const payload: ChatPayload = { k: 't', v: `${shareText}\n${url}`.slice(0, 1500) };
    try {
      const convId = convIdOf(user.uid, friendUid);
      const existing = (await loadMyConversationIds(user.uid)).has(convId);
      try {
        await sendDirect(user.uid, friendUid, payload, existing);
      } catch (e) {
        if (!existing && errorCode(e).includes('permission-denied')) {
          await sendDirect(user.uid, friendUid, payload, true);
        } else {
          throw e;
        }
      }
      if (!alive.current) return;
      setSentTo((prev) => new Set(prev).add(friendUid));
    } catch (e) {
      console.error('send post to friend failed:', e);
      flash('err', sendErrorText(e, t));
    } finally {
      if (alive.current) setBusy('');
    }
  };

  // ---- إضافة إلى قصتك ----
  const handleStory = async () => {
    if (!user || !url || busy) return;
    setBusy('story');
    setNotice(null);
    try {
      let mediaUrl = post.mediaUrl || '';
      let mediaType: 'image' | 'video' = post.mediaType === 'video' ? 'video' : 'image';
      if (!mediaUrl) {
        // منشور نصي: نرسم بطاقة صورة من النص
        const blob = await renderTextCard(post.content || authorName, authorName);
        const file = new File([blob], `post-${post.id || Date.now()}.png`, { type: 'image/png' });
        mediaUrl = await uploadVideoToCloudinary(file);
        mediaType = 'image';
      }
      await createStory({
        authorId: user.uid,
        authorName: (profile?.displayName || authorName || 'AnimeVerse').slice(0, 50),
        authorPhotoURL: profile?.photoURL,
        mediaUrl,
        mediaType,
        caption: url.slice(0, 200),
      });
      if (!alive.current) return;
      setStoryDone(true);
      flash('ok', t('psh.storyDone'));
    } catch (e) {
      console.error('share post as story failed:', e);
      flash('err', storyErrorText(e, t));
    } finally {
      if (alive.current) setBusy('');
    }
  };

  // ---- مشاركة عبر تطبيقات الجهاز (إنستغرام وغيره) ----
  const handleSystemShare = async () => {
    if (!url) return;
    setNotice(null);
    if (typeof navigator.share !== 'function') {
      const ok = await copyText(url);
      flash(ok ? 'ok' : 'err', ok ? t('common.linkCopied') : t('psh.err.send'));
      return;
    }
    try {
      await navigator.share({ title: authorName, text: shareText, url });
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return;
      console.error('web share failed:', e);
      flash('err', t('psh.err.send'));
    }
  };

  // ---- نسخ الرابط ----
  const handleCopy = async () => {
    if (!url) return;
    const ok = await copyText(url);
    if (!alive.current) return;
    if (ok) {
      setCopied(true);
      setNotice(null);
      window.setTimeout(() => {
        if (alive.current) setCopied(false);
      }, 1800);
    } else {
      flash('err', t('psh.err.send'));
    }
  };

  const visibleFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    return friendIds
      .map((id) => briefs[id])
      .filter((b): b is NonNullable<typeof b> => !!b)
      .filter((b) => !q || b.displayName.toLowerCase().includes(q) || (b.username ?? '').toLowerCase().includes(q))
      .slice(0, MAX_FRIENDS_SHOWN);
  }, [friendIds, briefs, search]);

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-dark-900 border-t border-white/10 rounded-t-3xl flex flex-col h-[78vh] max-h-[78vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('common.share')}
      >
        {/* المقبض */}
        <button type="button" onClick={onClose} aria-label={t('psh.close')} className="w-full pt-3 pb-2 flex justify-center">
          <span className="w-10 h-1 rounded-full bg-white/30" />
        </button>

        {/* البحث */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('psh.searchFriend')}
              className="w-full rounded-xl bg-white/5 border border-white/10 ps-9 pe-3 py-2.5 text-sm text-white outline-none focus:border-primary-500"
            />
          </div>
        </div>

        {/* الأصدقاء */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          {!user ? (
            <p className="p-6 text-center text-xs text-slate-500">{t('psh.needLogin')}</p>
          ) : friendsLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : friendsError ? (
            <p className="p-6 text-center text-xs text-red-300">{t('psh.friendsFailed')}</p>
          ) : visibleFriends.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">
              {friendIds.length === 0 ? t('psh.noFriends') : t('psh.noResults')}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-y-4 gap-x-2">
              {visibleFriends.map((f) => {
                const sent = sentTo.has(f.uid);
                const sending = busy === `send:${f.uid}`;
                return (
                  <button
                    key={f.uid}
                    type="button"
                    onClick={() => handleSendToFriend(f.uid)}
                    disabled={sent || !!busy}
                    className="flex flex-col items-center gap-1.5 active:scale-95 transition disabled:opacity-70"
                  >
                    <span className="relative">
                      <Avatar
                        src={f.photoURL}
                        seed={f.uid}
                        name={f.displayName}
                        className="w-[68px] h-[68px] rounded-full object-cover bg-dark-950"
                      />
                      {(sending || sent) && (
                        <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                          {sending ? (
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          ) : (
                            <Check className="w-7 h-7 text-emerald-300" />
                          )}
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] text-slate-200 text-center leading-tight w-full truncate px-1">
                      {f.displayName}
                    </span>
                    {sent && <span className="text-[10px] text-emerald-300 -mt-1">{t('psh.sent')}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* الإشعار */}
        {notice && (
          <div
            className={`mx-4 mb-2 p-2.5 rounded-2xl border flex items-start gap-2 ${
              notice.kind === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
            role="status"
          >
            {notice.kind === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <p className="text-xs leading-relaxed">{notice.text}</p>
          </div>
        )}

        {/* صف الإجراءات السفلي */}
        <div className="shrink-0 border-t border-white/10 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-4">
            <RoundAction
              label={t('psh.story')}
              onClick={handleStory}
              loading={busy === 'story'}
              done={storyDone}
              disabled={!user || !!busy}
            >
              <PlusCircle className="w-6 h-6" />
            </RoundAction>
            <RoundAction label={t('common.share')} onClick={handleSystemShare}>
              <Share2 className="w-6 h-6" />
            </RoundAction>
            <RoundAction label={t('common.copyLink')} onClick={handleCopy} done={copied}>
              <Link2 className="w-6 h-6" />
            </RoundAction>
            {APPS.map((app) => (
              <RoundAction
                key={app.id}
                label={app.label}
                bg={app.bg}
                onClick={() => openExternal(app.href(url, shareText))}
              >
                <span className="text-lg font-black">{app.glyph}</span>
              </RoundAction>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostShareSheet;
