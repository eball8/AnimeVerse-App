import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { doc, updateDoc } from 'firebase/firestore';
import {
  Heart, MessageCircle, Send, Link2, Check, Repeat2, Clapperboard,
  MoreHorizontal, Pencil, Trash2, X, Loader2, Volume2, VolumeX, Play, Share2, Music2, LogOut,
} from 'lucide-react';
import { db } from '../config/firebase';
import { isPendingCollaborator, respondToCollabInvite } from '../services/postService';
import type { Post } from '../services/postService';
import Avatar from './Avatar';
import {
  CollabAvatarStack, CollabInviteBanner, ContributorsSheet, useCollab, useCollabNames,
} from './CollabHeader';
import { timeAgo } from '../utils/timeAgo';
import { copyText, postLink, reelLink, shareLink, videoThumb } from '../utils/links';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../context/AuthContext';
import { isFeedActive, registerFeedPlayer, reportFeedRatio, useMediaLock } from '../utils/mediaManager';
import { useSyncedAudio } from '../utils/syncedAudio';

interface Props {
  post: Post;
  liked: boolean;
  canDelete: boolean;
  authorName: string;
  authorPhoto?: string;
  repostName?: string;
  onLike: (p: Post) => void;
  onComment: (p: Post) => void;
  onDelete: (p: Post) => void;
}

const openExternal = async (href: string) => {
  try {
    if (Capacitor.isNativePlatform()) await Browser.open({ url: href });
    else window.open(href, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(href, '_blank');
  }
};

const TARGETS: { id: string; label: string; bg: string; glyph: string; href: (u: string, t: string) => string }[] = [
  {
    id: 'wa',
    label: 'WhatsApp',
    bg: 'bg-[#25D366]',
    glyph: 'W',
    href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t}${u}`)}`,
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

/* ------------------------------------------------------------------
   حالة كتم الصوت مشتركة بين كل المنشورات (مثل انستغرام):
   تضغط زر الصوت مرة فتعمل كل الفيديوهات التالية بصوت.
------------------------------------------------------------------ */
let globalMuted = true;
const muteListeners = new Set<() => void>();
const useGlobalMute = (): [boolean, (v: boolean) => void] => {
  const [muted, setMuted] = useState(globalMuted);
  useEffect(() => {
    const fn = () => setMuted(globalMuted);
    muteListeners.add(fn);
    return () => {
      muteListeners.delete(fn);
    };
  }, []);
  const set = useCallback((v: boolean) => {
    globalMuted = v;
    muteListeners.forEach((f) => f());
  }, []);
  return [muted, set];
};

/* نقرة واحدة / نقرتان سريعتان (دبل تاب) */
const useTap = (onSingle: (() => void) | null, onDouble: () => void) => {
  const last = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return () => {
    const now = Date.now();
    if (now - last.current < 300) {
      window.clearTimeout(timer.current);
      last.current = 0;
      onDouble();
    } else {
      last.current = now;
      if (onSingle) timer.current = window.setTimeout(onSingle, 280);
    }
  };
};

// نسبة العرض/الارتفاع المسموحة في الفيد (مثل انستغرام: من 4:5 إلى 1.91:1)
const MIN_RATIO = 0.8;
const MAX_RATIO = 1.91;
const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

interface MediaProps {
  post: Post;
  isVideo: boolean;
  content: string;
  liked: boolean;
  onDoubleLike: () => void;
  openReelsLabel: string;
  mediaAlt: string;
}

/* ---------- الوسائط: بعرض الشاشة كاملاً ---------- */
const PostMedia: React.FC<MediaProps> = ({ post, isVideo, content, liked, onDoubleLike, openReelsLabel, mediaAlt }) => {
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerId = useId();
  const [muted, setGlobalMuted] = useGlobalMute();
  const [ratio, setRatio] = useState<number>(0.8);
  const [letterbox, setLetterbox] = useState(false);
  const [near, setNear] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const poster = isVideo ? videoThumb(post.mediaUrl) : undefined;

  const applyRatio = (w: number, h: number) => {
    if (!w || !h) return;
    const raw = w / h;
    setRatio(clampRatio(raw));
    setLetterbox(raw < MIN_RATIO - 0.01 || raw > MAX_RATIO + 0.01);
  };

  // تسجيل الفيديو لدى مدير الوسائط: فيديو واحد فقط يعمل، ويتوقف فوراً عند الإخفاء أو الـ Unmount
  useEffect(() => {
    if (!isVideo || !post.mediaUrl) return;
    const v = videoRef.current;
    const off = registerFeedPlayer(playerId, {
      box: () => boxRef.current,
      play: () => {
        videoRef.current?.play().catch(() => undefined);
      },
      pause: () => {
        videoRef.current?.pause();
      },
    });
    return () => {
      off();
      if (v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    };
  }, [isVideo, post.mediaUrl, playerId]);

  // تحميل مبكر + إبلاغ مدير الوسائط بنسبة ظهور الفيديو
  useEffect(() => {
    if (!isVideo || !boxRef.current) return;
    const el = boxRef.current;
    const nearIO = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setNear(true)),
      { rootMargin: '900px 0px' }
    );
    const playIO = new IntersectionObserver(
      (es) => es.forEach((e) => reportFeedRatio(playerId, e.intersectionRatio)),
      { threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1] }
    );
    nearIO.observe(el);
    playIO.observe(el);
    return () => {
      nearIO.disconnect();
      playIO.disconnect();
    };
  }, [isVideo, playerId]);

  // فيديو بصوت مستعار (ريمكس): يُكتم الفيديو دائماً ويُشغَّل الصوت المستعار بدلاً منه
  const borrowedAudio = isVideo ? post.audioUrl : undefined;
  useSyncedAudio(videoRef, borrowedAudio, muted, isVideo && near);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted || !!borrowedAudio;
  }, [muted, near, borrowedAudio]);

  // النقر على أي فيديو يفتح شاشة الريلز مباشرة (مثل انستغرام)
  const openReels = () => {
    if (!post.id) return;
    videoRef.current?.pause();
    navigate(`/reels/${post.id}`);
  };

  const likeBurst = () => {
    setBurst((n) => n + 1);
    if (!liked) onDoubleLike();
  };

  const onTap = useTap(isVideo && post.id ? openReels : null, likeBurst);

  useEffect(() => {
    if (!burst) return;
    const id = window.setTimeout(() => setBurst(0), 800);
    return () => window.clearTimeout(id);
  }, [burst]);

  /* منشور نصي فقط: لوحة ملونة بخط كبير */
  if (!post.mediaUrl) {
    if (!content) return null;
    const long = content.length > 220;
    return (
      <div
        onClick={onTap}
        className="relative w-full min-h-[260px] px-7 py-12 flex items-center justify-center bg-gradient-to-br from-primary-600/30 via-dark-900 to-accent-500/30 select-none"
      >
        <p
          dir="auto"
          className={`break-words whitespace-pre-wrap font-black text-white leading-relaxed ${
            long ? 'text-base text-start' : 'text-2xl text-center'
          }`}
        >
          {content}
        </p>
        {burst > 0 && <HeartBurst k={burst} />}
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      onClick={onTap}
      className="relative w-full overflow-hidden bg-black select-none"
      style={{ aspectRatio: String(ratio) }}
    >
      {/* خلفية ضبابية عند الصور/الفيديوهات الأطول أو الأعرض من المسموح */}
      {letterbox && (poster || !isVideo) && (
        <img
          src={isVideo ? poster : post.mediaUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60"
        />
      )}

      {isVideo ? (
        <>
          <video
            ref={videoRef}
            src={near ? post.mediaUrl : undefined}
            poster={poster}
            loop
            muted={muted || !!borrowedAudio}
            playsInline
            preload={near ? 'metadata' : 'none'}
            onLoadedMetadata={(e) => applyRatio(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
            onCanPlay={() => {
              if (isFeedActive(playerId)) videoRef.current?.play().catch(() => undefined);
            }}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            className={`relative w-full h-full ${letterbox ? 'object-contain' : 'object-cover'}`}
          />

          {paused && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-8 h-8 fill-white text-white ms-1" />
              </span>
            </span>
          )}

          {post.id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openReels();
              }}
              className="absolute top-3 end-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center active:scale-90 transition"
              aria-label={openReelsLabel}
            >
              <Clapperboard className="w-[18px] h-[18px]" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setGlobalMuted(!muted);
            }}
            className="absolute bottom-4 end-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center active:scale-90 transition"
            aria-label="mute"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: 'rgba(255,255,255,0.22)' }}>
            <div className="h-full" style={{ width: `${progress * 100}%`, background: '#fff' }} />
          </div>
        </>
      ) : imgFailed ? (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">{mediaAlt}</div>
      ) : (
        <img
          src={post.mediaUrl}
          alt={mediaAlt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => applyRatio(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          onError={() => setImgFailed(true)}
          className={`relative w-full h-full ${letterbox ? 'object-contain' : 'object-cover'}`}
        />
      )}

      {burst > 0 && <HeartBurst k={burst} />}
    </div>
  );
};

const HeartBurst: React.FC<{ k: number }> = ({ k }) => (
  <span key={k} className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <Heart
      className="w-28 h-28 animate-heart-pop"
      style={{ color: '#fff', fill: '#fff', filter: 'drop-shadow(0 6px 24px rgba(0,0,0,.45))' }}
    />
  </span>
);

const fmtCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
};

const PostCard: React.FC<Props> = ({
  post, liked, canDelete, authorName, authorPhoto, repostName, onLike, onComment, onDelete,
}) => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [flash, setFlash] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [popLike, setPopLike] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [localAllowAudio, setLocalAllowAudio] = useState<boolean | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);

  const [collabLocal, setCollabLocal] = useState<{ collaborators: string[]; collabAccepted: string[] } | null>(null);
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabErr, setCollabErr] = useState('');
  const [contribOpen, setContribOpen] = useState(false);
  const collabKey = `${(post.collaborators || []).join(',')}|${(post.collabAccepted || []).join(',')}`;
  useEffect(() => {
    setCollabLocal(null);
  }, [collabKey]);
  const cpost = collabLocal ? { authorId: post.authorId, ...collabLocal } : post;
  const { accepted, pending } = useCollab(cpost, authorName, authorPhoto);
  const collabNames = useCollabNames();

  useMediaLock(menuOpen || editing);

  useEffect(() => {
    setLocalContent(null);
  }, [post.content]);

  useEffect(() => {
    setLocalAllowAudio(null);
  }, [post.allowAudio]);

  const content = localContent ?? post.content;
  const isVideo = post.mediaType === 'video';
  const url = post.id ? (isVideo ? reelLink(post.id) : postLink(post.id)) : '';
  const isOwner = !!user && post.authorId === user.uid;
  const canEdit = isOwner && !!post.id;
  const ownsAudio = isVideo && !!post.mediaUrl && !!post.id && !post.repostOfId && !post.audioSourceId;
  const audioAllowed = ownsAudio && (localAllowAudio ?? post.allowAudio) === true;
  const shareText = (content || authorName).slice(0, 100);
  const caption = post.mediaUrl ? content : '';
  const longCaption = caption.length > 120 || caption.split('\n').length > 2;

  const doFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
  };

  const onCopy = async () => {
    if (url && (await copyText(url))) doFlash();
  };

  const onShare = async () => {
    if (!url) return;
    const r = await shareLink(url, authorName);
    if (r === 'copied') doFlash();
  };

  const likeNow = () => {
    if (!liked) {
      setPopLike(true);
      setTimeout(() => setPopLike(false), 400);
    }
    onLike(post);
  };

  const useAudio = () => {
    if (!post.id || !audioAllowed) return;
    setMenuOpen(false);
    navigate(`/create-post?audio=${post.id}`);
  };

  const toggleAllowAudio = async () => {
    if (!post.id || !isOwner || !ownsAudio || audioBusy) return;
    const next = !audioAllowed;
    setAudioBusy(true);
    setErr('');
    try {
      await updateDoc(doc(db, 'posts', post.id), { allowAudio: next });
      setLocalAllowAudio(next);
    } catch (e) {
      console.error(e);
      setErr(t('audio.saveFail'));
    } finally {
      setAudioBusy(false);
    }
  };

  const respondCollab = async (accept: boolean) => {
    if (!user || !post.id || collabBusy) return;
    setCollabBusy(true);
    setCollabErr('');
    try {
      await respondToCollabInvite(post, user.uid, accept);
      const col = cpost.collaborators || [];
      const acc = cpost.collabAccepted || [];
      setCollabLocal(
        accept
          ? { collaborators: col, collabAccepted: Array.from(new Set([...acc, user.uid])) }
          : { collaborators: col.filter((i) => i !== user.uid), collabAccepted: acc.filter((i) => i !== user.uid) }
      );
      setContribOpen(false);
      setMenuOpen(false);
    } catch (e) {
      console.error(e);
      setCollabErr(t('collab.failed'));
    } finally {
      setCollabBusy(false);
    }
  };

  const startEdit = () => {
    setMenuOpen(false);
    setDraft(content || '');
    setErr('');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!post.id || saving) return;
    const next = draft.trim().slice(0, 2000);
    if (!next && !post.mediaUrl && !post.repostOfId) {
      setErr(t('postCard.empty'));
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await updateDoc(doc(db, 'posts', post.id), { content: next });
      setLocalContent(next);
      setEditing(false);
    } catch (e) {
      console.error(e);
      setErr(t('postCard.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  const isCollab = accepted.length > 1 || (isOwner && pending.length > 0);
  const pendingMe = isPendingCollaborator(cpost, user?.uid);
  const iAmCollab =
    !!user && !isOwner && (cpost.collaborators || []).includes(user.uid) && (cpost.collabAccepted || []).includes(user.uid);

  const menuRow =
    'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-slate-200 bg-white/5 active:bg-white/10 transition';

  return (
    <div className="border-b border-white/10 pb-3">
      {repostName && (
        <p className="px-3 pt-2.5 text-[11px] text-slate-400 flex items-center gap-1.5">
          <Repeat2 className="w-3.5 h-3.5" /> {t('post.repostedFrom', { name: repostName })}
        </p>
      )}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {isCollab ? (
          <>
            <button onClick={() => setContribOpen(true)} className="shrink-0" aria-label={t('collab.sheetTitle')}>
              <CollabAvatarStack list={accepted} size={36} />
            </button>
            <button onClick={() => setContribOpen(true)} className="flex-1 min-w-0 text-start">
              <h4 className="text-[13.5px] font-extrabold text-white truncate leading-tight">{collabNames(accepted)}</h4>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5 truncate">
                {timeAgo(post.createdAt, lang)}
                {isOwner && pending.length > 0 && (
                  <span className="text-amber-300"> · {t('collab.pendingCount', { count: pending.length })}</span>
                )}
              </p>
            </button>
          </>
        ) : (
          <>
            <button onClick={() => navigate(`/user/${post.authorId}`)} className="shrink-0">
              <span className="block p-[2px] rounded-full bg-gradient-to-tr from-primary-500 via-accent-500 to-amber-400">
                <span className="block p-[2px] rounded-full bg-dark-950">
                  <Avatar
                    src={authorPhoto}
                    seed={post.authorId}
                    name={authorName}
                    className="w-9 h-9 rounded-full object-cover bg-dark-900"
                  />
                </span>
              </span>
            </button>
            <button onClick={() => navigate(`/user/${post.authorId}`)} className="flex-1 min-w-0 text-start">
              <h4 className="text-[13.5px] font-extrabold text-white truncate leading-tight">{authorName}</h4>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{timeAgo(post.createdAt, lang)}</p>
            </button>
          </>
        )}
        {post.id && (
          <button
            onClick={() => setMenuOpen(true)}
            aria-label={t('postCard.menu')}
            title={t('postCard.menu')}
            className="shrink-0 w-9 h-9 -me-1 rounded-full flex items-center justify-center text-slate-200 active:bg-white/10 transition"
          >
            <MoreHorizontal className="w-6 h-6" />
          </button>
        )}
      </div>

      {pendingMe && (
        <CollabInviteBanner
          inviterName={authorName}
          busy={collabBusy}
          error={collabErr}
          onAccept={() => respondCollab(true)}
          onDecline={() => respondCollab(false)}
        />
      )}

      <PostMedia
        post={post}
        isVideo={isVideo}
        content={content}
        liked={liked}
        onDoubleLike={likeNow}
        openReelsLabel={t('postCard.openReels')}
        mediaAlt={t('postCard.media')}
      />

      <div className="flex items-center gap-4 px-3 pt-3">
        <button
          onClick={likeNow}
          aria-label="like"
          className={`active:scale-90 transition ${liked ? 'text-red-400' : 'text-white'} ${popLike ? 'animate-like-pop' : ''}`}
        >
          <Heart className={`w-7 h-7 ${liked ? 'fill-red-400' : ''}`} strokeWidth={liked ? 2 : 1.8} />
        </button>
        <button onClick={() => onComment(post)} aria-label={t('comments.title')} className="text-white active:scale-90 transition">
          <MessageCircle className="w-7 h-7" strokeWidth={1.8} />
        </button>
        <button onClick={onShare} aria-label={t('common.share')} className="text-white active:scale-90 transition">
          <Send className="w-[26px] h-[26px] rtl:-scale-x-100" strokeWidth={1.8} />
        </button>
        <button
          onClick={onCopy}
          aria-label={t('common.copyLink')}
          className="ms-auto text-white active:scale-90 transition"
        >
          {flash ? <Check className="w-6 h-6 text-emerald-400" /> : <Link2 className="w-6 h-6" strokeWidth={1.8} />}
        </button>
      </div>

      {post.likesCount > 0 && (
        <p className="px-3 mt-2 text-[13.5px] font-extrabold text-white">
          {t('postCard.likes', { count: fmtCount(post.likesCount) })}
        </p>
      )}

      {caption && (
        <p
          dir="auto"
          className={`px-3 mt-1 text-[13.5px] leading-relaxed text-slate-200 break-words whitespace-pre-wrap text-start ${
            expanded ? '' : 'line-clamp-2'
          }`}
        >
          <button onClick={() => navigate(`/user/${post.authorId}`)} className="font-extrabold text-white me-1.5 align-baseline">
            {authorName}
          </button>
          {caption}
        </p>
      )}
      {caption && longCaption && !expanded && (
        <button onClick={() => setExpanded(true)} className="px-3 text-[13px] text-slate-500 font-semibold">
          {t('postCard.more')}
        </button>
      )}

      <button onClick={() => onComment(post)} className="block px-3 mt-1.5 text-[13px] text-slate-500 text-start">
        {post.commentsCount > 0
          ? t('postCard.viewComments', { count: fmtCount(post.commentsCount) })
          : t('postCard.addComment')}
      </button>

      {contribOpen && (
        <ContributorsSheet
          accepted={accepted}
          pending={isOwner ? pending : []}
          meUid={user?.uid}
          canLeave={iAmCollab}
          leaving={collabBusy}
          onLeave={() => respondCollab(false)}
          onClose={() => setContribOpen(false)}
        />
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setMenuOpen(false)}>
          <div
            className="w-full bg-dark-900 border-t border-white/10 rounded-t-3xl p-4 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-sm font-black text-white">{t('postCard.menu')}</h3>
              <button onClick={() => setMenuOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            {canEdit && (
              <button onClick={startEdit} className={menuRow}>
                <Pencil className="w-5 h-5 text-primary-400" /> {t('postCard.edit')}
              </button>
            )}

            {iAmCollab && (
              <button onClick={() => respondCollab(false)} disabled={collabBusy} className={`${menuRow} disabled:opacity-60`}>
                <LogOut className="w-5 h-5 text-primary-400" /> {t('collab.leave')}
              </button>
            )}

            {audioAllowed && (
              <button onClick={useAudio} className={menuRow}>
                <Music2 className="w-5 h-5 text-primary-400" /> {t('audio.use')}
              </button>
            )}

            {isOwner && ownsAudio && (
              <button
                onClick={toggleAllowAudio}
                disabled={audioBusy}
                role="switch"
                aria-checked={audioAllowed}
                className={`${menuRow} disabled:opacity-60`}
              >
                <Music2 className="w-5 h-5 text-primary-400" />
                <span className="flex-1 text-start">{t('audio.allowShort')}</span>
                <span
                  className={`relative w-10 h-[22px] rounded-full shrink-0 transition-colors ${
                    audioAllowed ? 'bg-primary-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${
                      audioAllowed ? 'start-[20px]' : 'start-[2px]'
                    }`}
                  />
                </span>
              </button>
            )}
            {err && !editing && <p className="text-[11px] text-red-400 px-1">{err}</p>}

            <button
              onClick={async () => {
                await onCopy();
                setMenuOpen(false);
              }}
              className={menuRow}
            >
              <Link2 className="w-5 h-5 text-primary-400" /> {t('common.copyLink')}
            </button>

            <button
              onClick={async () => {
                setMenuOpen(false);
                await onShare();
              }}
              className={menuRow}
            >
              <Share2 className="w-5 h-5 text-primary-400" /> {t('common.share')}
            </button>

            {url && (
              <div className="pt-2">
                <p className="text-[11px] text-slate-500 pb-2">{t('postCard.shareVia')}</p>
                <div className="grid grid-cols-4 gap-2">
                  {TARGETS.map((tg) => (
                    <button
                      key={tg.id}
                      onClick={() => {
                        setMenuOpen(false);
                        openExternal(tg.href(url, shareText));
                      }}
                      className="flex flex-col items-center gap-1.5 active:scale-95 transition"
                    >
                      <span
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-black ${tg.bg}`}
                      >
                        {tg.glyph}
                      </span>
                      <span className="text-[10px] text-slate-400">{tg.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canDelete && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(post);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 active:bg-red-500/20 transition mt-2"
              >
                <Trash2 className="w-5 h-5" /> {t('postCard.delete')}
              </button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => !saving && setEditing(false)}>
          <div
            className="w-full bg-dark-900 border-t border-white/10 rounded-t-3xl p-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white">{t('postCard.editTitle')}</h3>
              <button
                onClick={() => !saving && setEditing(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder={t('postCard.placeholder')}
              className="w-full p-3 rounded-2xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500 resize-none"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="text-red-400">{err}</span>
              <span className="tabular-nums">{draft.length}/2000</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || draft.trim() === (content || '').trim()}
                className="flex-1 btn-primary py-3 rounded-2xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t('postCard.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostCard;
