import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Camera, Send, Link2, Share2, Check, Loader2, ArrowRight, Search, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { convIdOf, sendDirect } from '../services/chatService';
import type { ChatPayload } from '../services/chatService';
import { uploadVideoToCloudinary } from '../services/cloudinaryService';
import { userProfileLink } from '../services/deepLinks';
import { getMutualFriendIds } from '../services/followService';
import { createStory } from '../services/storyService';
import { useUserBriefs } from '../services/userCache';
import { copyText } from '../utils/links';
import { generateQr, qrToSvgPath } from '../utils/qrcode';
import type { QrCode } from '../utils/qrcode';
import Avatar from './Avatar';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ---------------------------------------------------------------
// الأنواع
// ---------------------------------------------------------------
export interface ProfileShareSheetProps {
  userId: string;
  displayName: string;
  username?: string;
  photoURL?: string;
  onClose: () => void;
}

type SheetView = 'main' | 'friends';
type NoticeKind = 'ok' | 'err';

interface Notice {
  kind: NoticeKind;
  text: string;
}

const QUIET_ZONE = 4;
const MAX_FRIENDS_SHOWN = 100;

// ---------------------------------------------------------------
// رسم بطاقة القصة (صورة 1080×1920) تحتوي رمز QR واسم صاحب الحساب
// ---------------------------------------------------------------
const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const renderStoryCard = (
  qr: QrCode,
  displayName: string,
  username: string | undefined,
  caption: string
): Promise<Blob> =>
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
    ctx.font = '800 96px sans-serif';
    ctx.fillText('AnimeVerse', W / 2, 330);

    // البطاقة البيضاء
    const cardW = 820;
    const cardH = 1060;
    const cardX = (W - cardW) / 2;
    const cardY = 440;
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, cardX, cardY, cardW, cardH, 64);
    ctx.fill();

    // رمز QR (مع هامش أبيض حوله)
    const modulesWithQuiet = qr.size + QUIET_ZONE * 2;
    const cell = Math.max(1, Math.floor(660 / modulesWithQuiet));
    const qrPx = cell * modulesWithQuiet;
    const qrX = Math.round((W - qrPx) / 2);
    const qrY = cardY + 70;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX, qrY, qrPx, qrPx);
    ctx.fillStyle = '#000000';
    qr.modules.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) ctx.fillRect(qrX + (x + QUIET_ZONE) * cell, qrY + (y + QUIET_ZONE) * cell, cell, cell);
      });
    });

    ctx.fillStyle = '#111827';
    ctx.font = '800 68px sans-serif';
    ctx.fillText(clip(displayName, 22), W / 2, qrY + qrPx + 130);
    if (username) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '600 46px sans-serif';
      ctx.fillText(`@${clip(username, 28)}`, W / 2, qrY + qrPx + 205);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 50px sans-serif';
    ctx.fillText(clip(caption, 40), W / 2, cardY + cardH + 150);

    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('BLOB_FAILED'))),
      'image/png'
    );
  });

// ---------------------------------------------------------------
// مساعدات الإرسال
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// صف إجراء
// ---------------------------------------------------------------
const ActionRow: React.FC<{
  icon: React.ElementType;
  label: string;
  sub: string;
  loading?: boolean;
  done?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, sub, loading, done, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 text-start disabled:opacity-50"
  >
    <span className="w-10 h-10 rounded-2xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shrink-0">
      {loading ? (
        <Loader2 className="w-5 h-5 text-primary-300 animate-spin" />
      ) : done ? (
        <Check className="w-5 h-5 text-emerald-400" />
      ) : (
        <Icon className="w-5 h-5 text-primary-300" />
      )}
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-bold text-white">{label}</span>
      <span className="block text-[11px] text-slate-500 mt-0.5">{sub}</span>
    </span>
  </button>
);

// ---------------------------------------------------------------
// النافذة
// ---------------------------------------------------------------
const ProfileShareSheet: React.FC<ProfileShareSheetProps> = ({
  userId, displayName, username, photoURL, onClose,
}) => {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const me = user?.uid ?? '';

  const [view, setView] = useState<SheetView>('main');
  const [busy, setBusy] = useState<string>('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [storyDone, setStoryDone] = useState(false);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
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

  const link = useMemo<string>(() => {
    try {
      return userProfileLink(userId);
    } catch {
      return '';
    }
  }, [userId]);

  const qr = useMemo<QrCode | null>(() => {
    if (!link) return null;
    try {
      return generateQr(link);
    } catch (e) {
      console.error('QR generation failed:', e);
      return null;
    }
  }, [link]);

  const qrPath = useMemo<string>(() => (qr ? qrToSvgPath(qr) : ''), [qr]);

  const shareText = t('psh.shareText', {
    name: `${displayName}${username ? ` (@${username})` : ''}`,
  });

  const briefs = useUserBriefs(friendIds);

  const flash = (kind: NoticeKind, text: string) => {
    if (!alive.current) return;
    setNotice({ kind, text });
  };

  // ---- نسخ الرابط ----
  const handleCopy = async () => {
    if (!link) return;
    const ok = await copyText(link);
    if (!alive.current) return;
    if (ok) {
      setCopied(true);
      setNotice(null);
      window.setTimeout(() => {
        if (alive.current) setCopied(false);
      }, 1800);
    } else {
      flash('err', t('psh.copyFailed'));
    }
  };

  // ---- المشاركة عبر Web Share API (مع نسخ الرابط كبديل) ----
  const handleWebShare = async () => {
    if (!link) return;
    setNotice(null);
    if (typeof navigator.share !== 'function') {
      const ok = await copyText(link);
      flash(ok ? 'ok' : 'err', ok ? t('psh.shareUnsupported') : t('psh.shareFailed'));
      return;
    }
    try {
      await navigator.share({ title: displayName, text: shareText, url: link });
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return;
      console.error('web share failed:', e);
      flash('err', t('psh.shareFailed'));
    }
  };

  // ---- المشاركة كقصة ----
  const handleStory = async () => {
    if (!user || !qr || !link || busy) return;
    setBusy('story');
    setNotice(null);
    try {
      const blob = await renderStoryCard(qr, displayName, username, t('psh.cardCaption'));
      const file = new File([blob], `profile-${userId}.png`, { type: 'image/png' });
      const mediaUrl = await uploadVideoToCloudinary(file);
      await createStory({
        authorId: user.uid,
        authorName: (profile?.displayName || displayName || 'AnimeVerse').slice(0, 50),
        authorPhotoURL: profile?.photoURL,
        mediaUrl,
        mediaType: 'image',
        caption: `${shareText}\n${link}`.slice(0, 200),
      });
      if (!alive.current) return;
      setStoryDone(true);
      flash('ok', t('psh.storyDone'));
    } catch (e) {
      console.error('share as story failed:', e);
      flash('err', storyErrorText(e, t));
    } finally {
      if (alive.current) setBusy('');
    }
  };

  // ---- فتح قائمة الأصدقاء ----
  const openFriends = async () => {
    if (!user) return;
    setView('friends');
    setNotice(null);
    setSearch('');
    setFriendsLoading(true);
    setFriendsError(false);
    try {
      const ids = await getMutualFriendIds(user.uid);
      if (!alive.current) return;
      setFriendIds(ids.filter((id) => id !== userId).slice(0, 300));
    } catch (e) {
      console.error('friends load failed:', e);
      if (alive.current) setFriendsError(true);
    } finally {
      if (alive.current) setFriendsLoading(false);
    }
  };

  // ---- الإرسال إلى صديق في المحادثة ----
  const handleSendToFriend = async (friendUid: string) => {
    if (!user || !link || busy) return;
    setBusy(`send:${friendUid}`);
    setNotice(null);
    const payload: ChatPayload = { k: 't', v: `${shareText}\n${link}`.slice(0, 1500) };
    try {
      const convId = convIdOf(user.uid, friendUid);
      const existing = (await loadMyConversationIds(user.uid)).has(convId);
      try {
        await sendDirect(user.uid, friendUid, payload, existing);
      } catch (e) {
        // قد تكون المحادثة خارج أول 200 نتيجة: نعيد المحاولة مرة واحدة كمحادثة موجودة
        if (!existing && errorCode(e).includes('permission-denied')) {
          await sendDirect(user.uid, friendUid, payload, true);
        } else {
          throw e;
        }
      }
      if (!alive.current) return;
      setSentTo((prev) => new Set(prev).add(friendUid));
    } catch (e) {
      console.error('send profile to friend failed:', e);
      flash('err', sendErrorText(e, t));
    } finally {
      if (alive.current) setBusy('');
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

  const noticeEl = notice && (
    <div
      className={`mx-4 mb-3 p-3 rounded-2xl border flex items-start gap-2 ${
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
  );

  return (
    <div className="fixed inset-0 z-[115] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-dark-900 border-t border-white/10 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('psh.title')}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          {view === 'friends' ? (
            <button
              type="button"
              onClick={() => { setView('main'); setNotice(null); }}
              className="flex items-center gap-2 text-sm text-primary-400 font-bold"
            >
              <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> {t('common.back')}
            </button>
          ) : (
            <h3 className="text-white font-black truncate">{t('psh.title')}</h3>
          )}
          <button type="button" onClick={onClose} className="text-slate-400 p-1" aria-label={t('psh.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {view === 'main' ? (
          <>
            <div className="px-5 pb-4 text-center">
              {qr ? (
                <div className="mx-auto w-56 h-56 bg-white rounded-2xl p-2 shadow-lg">
                  <svg
                    viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${qr.size + QUIET_ZONE * 2} ${qr.size + QUIET_ZONE * 2}`}
                    className="w-full h-full"
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label={t('psh.qrAria')}
                  >
                    <rect
                      x={-QUIET_ZONE}
                      y={-QUIET_ZONE}
                      width={qr.size + QUIET_ZONE * 2}
                      height={qr.size + QUIET_ZONE * 2}
                      fill="#ffffff"
                    />
                    <path d={qrPath} fill="#000000" />
                  </svg>
                </div>
              ) : (
                <div className="mx-auto w-56 h-56 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-4">
                  <p className="text-xs text-slate-400">{t('psh.qrFailed')}</p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 mt-3">
                <Avatar
                  src={photoURL}
                  seed={userId}
                  name={displayName}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div className="text-start min-w-0">
                  <p className="text-sm font-black text-white truncate">{displayName}</p>
                  {username && <p className="text-[11px] text-slate-500 truncate">@{username}</p>}
                </div>
              </div>
              {link && (
                <p className="text-[10px] text-slate-500 mt-2 break-all" dir="ltr">{link}</p>
              )}
            </div>

            {noticeEl}

            <div className="divide-y divide-white/5 border-t border-white/10">
              <ActionRow
                icon={Camera}
                label={t('psh.story')}
                sub={user ? t('psh.storySub') : t('psh.needLogin')}
                loading={busy === 'story'}
                done={storyDone}
                disabled={!user || !qr || !!busy}
                onClick={handleStory}
              />
              <ActionRow
                icon={Send}
                label={t('psh.sendFriend')}
                sub={user ? t('psh.sendFriendSub') : t('psh.needLogin')}
                disabled={!user || !link || !!busy}
                onClick={openFriends}
              />
              <ActionRow
                icon={Link2}
                label={t('psh.copyLink')}
                sub={t('psh.copyLinkSub')}
                done={copied}
                disabled={!link}
                onClick={handleCopy}
              />
              <ActionRow
                icon={Share2}
                label={t('psh.shareApps')}
                sub={t('psh.shareAppsSub')}
                disabled={!link}
                onClick={handleWebShare}
              />
            </div>
          </>
        ) : (
          <>
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

            {noticeEl}

            <div className="border-t border-white/10 divide-y divide-white/5">
              {friendsLoading ? (
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
                visibleFriends.map((f) => {
                  const sent = sentTo.has(f.uid);
                  const sending = busy === `send:${f.uid}`;
                  return (
                    <div key={f.uid} className="flex items-center gap-3 px-4 py-3">
                      <Avatar
                        src={f.photoURL}
                        seed={f.uid}
                        name={f.displayName}
                        className="w-10 h-10 rounded-full object-cover bg-dark-900"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{f.displayName}</p>
                        {f.username && <p className="text-[11px] text-slate-500 truncate">@{f.username}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSendToFriend(f.uid)}
                        disabled={sent || !!busy}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 ${
                          sent
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                        }`}
                      >
                        {sending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : sent ? (
                          <><Check className="w-3.5 h-3.5" /> {t('psh.sent')}</>
                        ) : (
                          <><Send className="w-3.5 h-3.5" /> {t('psh.send')}</>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfileShareSheet;
