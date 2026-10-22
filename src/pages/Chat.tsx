import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, Send, Mic, Trash2, Lock, Loader2, Play, Pause, X, Paperclip, RefreshCw,
  CornerUpLeft, Share2, Users, Plus, MoreVertical, Check, Copy, Maximize2, Palette,
  Search, ChevronUp, ChevronDown, Timer, Ban, Pin, PinOff, Pencil, Download
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { doc as fsDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import ChatOptionsSheet, { ReportSheet } from '../components/ChatOptionsSheet';
import ReportFlow from '../components/ReportFlow';
import { profileLink } from '../utils/links';
import { useConfirm } from '../components/ConfirmDialog';
import { useUserBriefs } from '../services/userCache';
import { notify } from '../services/notificationService';
import { downloadMediaBlob, isNativeGallery } from '../services/galleryService';
import { usePresenceInfo, formatPresence, PRESENCE_DOT_CLASS } from '../services/presenceService';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type { VoiceResult } from '../hooks/useVoiceRecorder';
import { decryptBlob, encryptBlob, getLocalKey } from '../services/cryptoService';
import type { LocalKey } from '../services/cryptoService';
import { uploadEncryptedBlob } from '../services/cloudinaryService';
import { compressImage, formatBytes } from '../utils/media';
import {
  convIdOf, decryptMessage, decryptGroupMessage, getPublicKeyInfo, removeMessage, sendDirect, sendGroup,
  subscribeMessages, subscribeConversations, toggleReaction, setConversationTheme, markConversationRead, isUnread,
  isExpired, setDisappearAfter, DISAPPEAR_24H_MS, blockUser, unblockUser, subscribeBlockedIds, reportUser,
  editDirect, editGroup, setPinnedMessages, MAX_PINNED
} from '../services/chatService';
import type { ChatPayload, PublicKeyInfo, RawMessage, Conversation, ReportKind } from '../services/chatService';
import { setChatPref, subscribeChatPrefs } from '../services/chatPrefsService';
import type { ChatPrefMap } from '../services/chatPrefsService';

type VoicePayload = Extract<ChatPayload, { k: 'v' }>;
type MediaPayload = Extract<ChatPayload, { k: 'm' }> & { c?: string }; // c = نص مكتوب مع الصورة/الفيديو

const MAX_VIDEO_MB = 9;
const MAX_ATTACH_PER_PICK = 5;
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// نص حسب اللغة (العربية / الإنجليزية / الفرنسية، وأي لغة أخرى تأخذ الإنجليزية)
const pick = (lang: string, ar: string, en: string, fr?: string): string =>
  lang === 'ar' ? ar : lang === 'fr' ? (fr ?? en) : en;

// ---------------------------------------------------------------
// الإشارة @username
// ---------------------------------------------------------------
const MENTION_SRC = '(^|\\s)@([a-zA-Z0-9_.]{3,30})';
const extractMentions = (s: string): string[] => {
  const re = new RegExp(MENTION_SRC, 'g');
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.add(m[2].toLowerCase());
  return Array.from(out);
};

const renderWithMentions = (s: string): React.ReactNode => {
  const re = new RegExp(MENTION_SRC, 'g');
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const start = m.index + m[1].length;
    if (start > last) nodes.push(s.slice(last, start));
    nodes.push(<span key={key++} className="font-black underline decoration-white/40">@{m[2]}</span>);
    last = start + 1 + m[2].length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes.length ? nodes : s;
};

// ---------------------------------------------------------------
// تنزيل الصور/الفيديو إلى الهاتف
// ---------------------------------------------------------------
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(blob);
  });

const extOfMime = (mime: string): string =>
  mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : mime.includes('webp') ? 'webp'
    : mime.startsWith('video/') ? (mime.includes('webm') ? 'webm' : 'mp4') : 'jpg';

const saveMediaToDevice = async (src: string, fallbackMime: string): Promise<void> => {
  const res = await fetch(src);
  const blob = await res.blob();
  const mime = blob.type || fallbackMime;

  if (Capacitor.isNativePlatform()) {
    // 1) المعرض (إن كانت الإضافة الأصلية تدعمه)
    if (isNativeGallery()) {
      try { await downloadMediaBlob(blob, mime); return; }
      catch (e) { console.error('gallery save failed, using Documents', e); }
    }
    // 2) مجلد Documents/AnimeVerse (يعمل دائماً)
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: `AnimeVerse/AnimeVerse_${Date.now()}.${extOfMime(mime)}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    return;
  }
  await downloadMediaBlob(blob, mime);
};

// ---------------------------------------------------------------
// الثيمات والخلفيات (تُحفظ في وثيقة المحادثة، فيراها الطرفان)
// ---------------------------------------------------------------
interface ChatTheme { id: string; bg: string; mine: string; }
const THEMES: ChatTheme[] = [
  { id: 'default', bg: 'var(--av-chat-bg)', mine: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
  { id: 'dark', bg: '#000000', mine: 'linear-gradient(135deg,#334155,#475569)' },
  { id: 'romantic', bg: 'linear-gradient(160deg,#4a0d2e,#1a0510)', mine: 'linear-gradient(135deg,#ec4899,#f43f5e)' },
  { id: 'friends', bg: 'linear-gradient(160deg,#0b2a5b,#06122b)', mine: 'linear-gradient(135deg,#3b82f6,#06b6d4)' },
  { id: 'sunset', bg: 'linear-gradient(160deg,#4a1d0a,#2a0a2e)', mine: 'linear-gradient(135deg,#f97316,#ec4899)' },
  { id: 'ocean', bg: 'linear-gradient(160deg,#032b3a,#04121f)', mine: 'linear-gradient(135deg,#06b6d4,#3b82f6)' },
  { id: 'forest', bg: 'linear-gradient(160deg,#0b3320,#04140c)', mine: 'linear-gradient(135deg,#10b981,#84cc16)' },
  { id: 'aurora', bg: 'linear-gradient(160deg,#1b0b3b,#052e2b)', mine: 'linear-gradient(135deg,#a855f7,#14b8a6)' },
  { id: 'sakura', bg: 'linear-gradient(160deg,#3b1030,#17081a)', mine: 'linear-gradient(135deg,#f472b6,#c084fc)' },
  { id: 'fire', bg: 'linear-gradient(160deg,#3b0a0a,#140404)', mine: 'linear-gradient(135deg,#ef4444,#f59e0b)' },
  { id: 'midnight', bg: 'linear-gradient(160deg,#0f0c29,#302b63)', mine: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
  { id: 'mint', bg: 'linear-gradient(160deg,#06302b,#0b1a2e)', mine: 'linear-gradient(135deg,#2dd4bf,#38bdf8)' },
];
const themeOf = (id?: string): ChatTheme => THEMES.find((x) => x.id === id) || THEMES[0];

// ---------------------------------------------------------------
// أدوات صغيرة
// ---------------------------------------------------------------
const EMOJI_RE = new RegExp('\\p{Extended_Pictographic}', 'u');
const firstEmoji = (s: string): string | null => {
  const Seg = (Intl as any).Segmenter;
  const parts: string[] = Seg
    ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x: any) => x.segment as string)
    : Array.from(s);
  return parts.find((g) => EMOJI_RE.test(g)) ?? null;
};

const previewOf = (p: ChatPayload | null | undefined, t: (k: string) => string): string => {
  if (!p) return t('chatUi.previewLocked');
  if (p.k === 't') return p.v;
  if (p.k === 'v') return t('chatUi.previewVoice');
  return p.mime.startsWith('video/') ? t('chatUi.previewVideo') : t('chatUi.previewImage');
};

const mediaCache = new Map<string, string>();
const rememberMedia = (url: string, blob: Blob) => { mediaCache.set(url, URL.createObjectURL(blob)); };

const ensureMediaSrc = async (p: { url: string; key: string; iv: string; mime: string }): Promise<string> => {
  const cached = mediaCache.get(p.url);
  if (cached) return cached;
  const res = await fetch(p.url);
  if (!res.ok) throw new Error('fetch');
  const blob = await decryptBlob(await res.arrayBuffer(), p.key, p.iv, p.mime);
  const objectUrl = URL.createObjectURL(new Blob([blob], { type: p.mime }));
  mediaCache.set(p.url, objectUrl);
  return objectUrl;
};

// ---------------------------------------------------------------
// وسائط مشفّرة (صور/فيديو)
// ---------------------------------------------------------------
const useDecryptedMedia = (p: MediaPayload, auto: boolean) => {
  const [src, setSrc] = useState<string | null>(() => mediaCache.get(p.url) ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const cached = mediaCache.get(p.url);
    if (cached) { setSrc(cached); return; }
    setLoading(true); setFailed(false);
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error('fetch');
      const blob = await decryptBlob(await res.arrayBuffer(), p.key, p.iv, p.mime);
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: p.mime }));
      mediaCache.set(p.url, objectUrl); setSrc(objectUrl);
    } catch (e) { console.error(e); setFailed(true); } finally { setLoading(false); }
  }, [p.url, p.key, p.iv, p.mime]);
  useEffect(() => { if (auto && !src) load(); }, [auto, src, load]);
  return { src, loading, failed, load };
};

// ---------------------------------------------------------------
// الرسالة الصوتية
// ---------------------------------------------------------------
let activeAudio: HTMLAudioElement | null = null;

const VoiceBubble: React.FC<{ payload: VoicePayload }> = ({ payload }) => {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(() => mediaCache.get(payload.url) ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    const cached = mediaCache.get(payload.url);
    if (cached) { setSrc(cached); return; }
    setLoading(true); setFailed(false);
    try {
      const res = await fetch(payload.url);
      if (!res.ok) throw new Error('fetch');
      const blob = await decryptBlob(await res.arrayBuffer(), payload.key, payload.iv, payload.mime);
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: payload.mime }));
      mediaCache.set(payload.url, objectUrl);
      setSrc(objectUrl);
    } catch (e) { console.error(e); setFailed(true); } finally { setLoading(false); }
  }, [payload.url, payload.key, payload.iv, payload.mime]);

  useEffect(() => { if (!src) load(); }, [src, load]);
  useEffect(() => () => { if (activeAudio === audioRef.current) activeAudio = null; }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!src || !a) { if (!loading) load(); return; }
    if (a.paused) {
      if (activeAudio && activeAudio !== a) activeAudio.pause();
      activeAudio = a;
      a.play().catch((e) => { console.error('play failed', e); setFailed(true); });
    } else {
      a.pause();
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !src || !payload.dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    let ratio = (e.clientX - rect.left) / rect.width;
    if (rtl) ratio = 1 - ratio;
    try { a.currentTime = Math.max(0, Math.min(1, ratio)) * payload.dur; } catch { /* ignore */ }
  };

  const progress = payload.dur ? Math.min(100, (pos / payload.dur) * 100) : 0;

  return (
    <div className="flex items-center gap-3 min-w-[190px]" onContextMenu={(e) => e.preventDefault()}>
      <button
        type="button"
        onClick={toggle}
        className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 active:scale-90 transition touch-manipulation"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : failed ? <RefreshCw className="w-4 h-4" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1 h-6 flex items-center cursor-pointer" onClick={seek}>
        <div className="w-full h-1.5 rounded-full bg-white/25 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: 'rgb(var(--av-fg-rgb))' }} />
        </div>
      </div>
      <span className="text-[11px] opacity-80 tabular-nums">
        {failed ? t('chat.voiceError') : fmt(playing ? pos : payload.dur)}
      </span>
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="auto"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      />
    </div>
  );
};

const MediaBubble: React.FC<{ payload: MediaPayload; onOpen: (src: string, type: 'image' | 'video') => void }> = ({ payload, onOpen }) => {
  const { t } = useI18n();
  const isVideo = payload.mime.startsWith('video/');
  const { src, loading, failed, load } = useDecryptedMedia(payload, !isVideo);
  if (isVideo) {
    if (!src) {
      return (
        <div className="w-56">
          <button onClick={load} className="relative w-56 h-40 rounded-xl bg-black/40 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition">
            <span className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : failed ? <RefreshCw className="w-5 h-5" /> : <Play className="w-5 h-5" />}</span>
            <span className="text-[11px] opacity-80">{failed ? t('chat.mediaError') : `${t('chat.video')} • ${formatBytes(payload.size)}`}</span>
          </button>
          {payload.c ? <p className="selectable px-1.5 pt-1.5 text-sm whitespace-pre-wrap break-words">{renderWithMentions(payload.c)}</p> : null}
        </div>
      );
    }
    return (
      <div className="w-56">
        <div className="relative w-56">
          <video src={src} controls playsInline className="w-56 max-h-72 rounded-xl bg-black" />
          <button onClick={() => onOpen(src, 'video')} className="absolute top-2 end-2 p-1.5 rounded-full bg-black/60 text-white"><Maximize2 className="w-3.5 h-3.5" /></button>
        </div>
        {payload.c ? <p className="selectable px-1.5 pt-1.5 text-sm whitespace-pre-wrap break-words">{renderWithMentions(payload.c)}</p> : null}
      </div>
    );
  }
  const ratio = Math.min(1.8, Math.max(0.6, payload.w && payload.h ? payload.w / payload.h : 4 / 3));
  return (
    <div className="w-56">
      <div className="relative w-56 rounded-xl overflow-hidden bg-black/30" style={{ aspectRatio: String(ratio) }}>
        {src ? (<img src={src} alt="" draggable={false} onClick={() => onOpen(src, 'image')} className="w-full h-full object-cover cursor-pointer" />) :
         failed ? (<button onClick={load} className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs opacity-80"><RefreshCw className="w-5 h-5" /> {t('chat.mediaError')}</button>) :
         (<div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin opacity-70" /></div>)}
      </div>
      {payload.c ? <p className="selectable px-1.5 pt-1.5 text-sm whitespace-pre-wrap break-words">{renderWithMentions(payload.c)}</p> : null}
    </div>
  );
};

// ---------------------------------------------------------------
// قائمة الضغط المطوّل
// ---------------------------------------------------------------
const MessageSheet: React.FC<{
  mine: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canDownload: boolean;
  pinned: boolean;
  myEmojis: string[];
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ mine, canCopy, canEdit, canDownload, pinned, myEmojis, onReact, onReply, onForward, onCopy, onEdit, onPin, onDownload, onDelete, onClose }) => {
  const { t, lang } = useI18n();
  const [picker, setPicker] = useState(false);
  const [val, setVal] = useState('');
  const btn = 'w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 active:bg-white/10 text-start';
  return (
    <div className="fixed inset-0 z-[115] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-sm m-3 mb-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="bg-dark-900 border border-white/10 rounded-full p-1.5 flex items-center justify-between gap-1 shadow-2xl">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => onReact(e)} className={`w-10 h-10 rounded-full text-xl flex items-center justify-center active:scale-90 transition ${myEmojis.includes(e) ? 'bg-primary-500/30' : 'hover:bg-white/10'}`}>{e}</button>
          ))}
          <button onClick={() => setPicker((v) => !v)} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-90 transition"><Plus className="w-5 h-5" /></button>
        </div>

        {picker && (
          <div className="bg-dark-900 border border-white/10 rounded-2xl p-3">
            <p className="text-[11px] text-slate-400 mb-2">{t('chatUi.emojiHint')}</p>
            <input
              autoFocus
              value={val}
              onChange={(e) => {
                const em = firstEmoji(e.target.value);
                if (em) onReact(em); else setVal('');
              }}
              placeholder="😀"
              className="w-full px-4 py-2.5 rounded-xl bg-dark-800 border border-white/10 text-white text-center text-xl outline-none focus:border-primary-500"
            />
          </div>
        )}

        <div className="bg-dark-900 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
          <button onClick={onReply} className={btn}><CornerUpLeft className="w-4 h-4 text-slate-300" /> {t('chatUi.reply')}</button>
          <button onClick={onForward} className={btn}><Share2 className="w-4 h-4 text-slate-300" /> {t('chatUi.forward')}</button>
          {canCopy && <button onClick={onCopy} className={btn}><Copy className="w-4 h-4 text-slate-300" /> {t('chatUi.copy')}</button>}
          {canEdit && <button onClick={onEdit} className={btn}><Pencil className="w-4 h-4 text-slate-300" /> {pick(lang, 'تعديل', 'Edit', 'Modifier')}</button>}
          <button onClick={onPin} className={btn}>
            {pinned ? <PinOff className="w-4 h-4 text-slate-300" /> : <Pin className="w-4 h-4 text-slate-300" />} {pinned ? pick(lang, 'إلغاء التثبيت', 'Unpin', 'Désépingler') : pick(lang, 'تثبيت', 'Pin', 'Épingler')}
          </button>
          {canDownload && <button onClick={onDownload} className={btn}><Download className="w-4 h-4 text-slate-300" /> {pick(lang, 'تنزيل', 'Download', 'Télécharger')}</button>}
          {mine && <button onClick={onDelete} className={`${btn} !text-red-400`}><Trash2 className="w-4 h-4" /> {t('chatUi.delete')}</button>}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// إعادة التوجيه
// ---------------------------------------------------------------
const ForwardModal: React.FC<{ convs: Conversation[]; onClose: () => void; onPick: (c: Conversation) => void }> = ({ convs, onClose, onPick }) => {
  const { t } = useI18n();
  const briefs = useUserBriefs(convs.filter((c) => c.type !== 'group').map((c) => c.otherUid));
  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-900 w-full max-w-sm rounded-2xl overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-white font-bold">{t('chatUi.forwardTo')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {convs.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">{t('chatUi.noChats')}</p>}
          {convs.map((c) => {
            const isGroup = c.type === 'group';
            const b = !isGroup ? briefs[c.otherUid] : null;
            return (
              <button key={c.id} onClick={() => onPick(c)} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition">
                {isGroup
                  ? <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center"><Users className="w-5 h-5 text-slate-400" /></div>
                  : <Avatar src={b?.photoURL} seed={c.otherUid} name={b?.displayName} className="w-10 h-10 rounded-full object-cover" />}
                <span className="text-sm font-bold text-white truncate">{isGroup ? (c.name || t('chatUi.group')) : b?.displayName || '...'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// ثيم وخلفية المحادثة
// ---------------------------------------------------------------
const ThemeSheet: React.FC<{ current: string; onPick: (id: string) => void; onClose: () => void }> = ({ current, onPick, onClose }) => {
  const { t } = useI18n();
  return (
  <div className="fixed inset-0 z-[115] bg-black/60 flex items-end justify-center" onClick={onClose}>
    <div className="w-full max-w-md bg-dark-900 border-t border-white/10 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-black flex items-center gap-2"><Palette className="w-5 h-5 text-primary-400" /> {t('chatUi.themeTitle')}</h3>
        <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {THEMES.map((th) => (
          <button key={th.id} onClick={() => onPick(th.id)} className="flex flex-col items-center gap-1.5">
            <span className="relative w-14 h-14 rounded-2xl border border-white/15 overflow-hidden flex items-end justify-end p-1.5" style={{ background: th.bg }}>
              <span className="w-6 h-3 rounded-full" style={{ background: th.mine }} />
              {current === th.id && <span className="absolute inset-0 bg-black/40 flex items-center justify-center"><Check className="w-5 h-5 text-white" /></span>}
            </span>
            <span className="text-[10px] text-slate-300 truncate max-w-full">{t(`chatTheme.${th.id}`)}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-4">{t('chatUi.themeNote')}</p>
    </div>
  </div>
  );
};

// ---------------------------------------------------------------
// الوسائط المشتركة
// ---------------------------------------------------------------
const MediaThumb: React.FC<{ payload: MediaPayload; onOpen: (src: string, type: 'image' | 'video') => void }> = ({ payload, onOpen }) => {
  const isVideo = payload.mime.startsWith('video/');
  const { src, loading, failed, load } = useDecryptedMedia(payload, !isVideo);

  const open = async () => {
    const type: 'image' | 'video' = isVideo ? 'video' : 'image';
    if (src) { onOpen(src, type); return; }
    await load();
    const ready = mediaCache.get(payload.url);
    if (ready) onOpen(ready, type);
  };

  return (
    <button type="button" onClick={open} className="relative aspect-square overflow-hidden rounded-lg bg-white/5 active:scale-95 transition">
      {!isVideo && src && <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />}
      {isVideo && src && <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover" />}
      <span className="absolute inset-0 flex items-center justify-center">
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-white/80" />
          : failed ? <RefreshCw className="w-5 h-5 text-white/80" />
          : isVideo ? <span className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"><Play className="w-4 h-4 text-white fill-white" /></span>
          : !src ? <Loader2 className="w-5 h-5 animate-spin text-white/50" /> : null}
      </span>
    </button>
  );
};

const SharedMediaSheet: React.FC<{
  items: MediaPayload[];
  onOpen: (src: string, type: 'image' | 'video') => void;
  onClose: () => void;
}> = ({ items, onOpen, onClose }) => {
  const { t } = useI18n();
  return (
  <div className="fixed inset-0 z-[115] bg-black/60 flex items-end justify-center" onClick={onClose}>
    <div
      className="w-full max-w-md bg-dark-900 border-t border-white/10 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-black">{t('chatUi.mediaTitle', { count: items.length })}</h3>
        <button type="button" onClick={onClose} className="text-slate-400 p-1" aria-label={t('chatUi.close')}><X className="w-5 h-5" /></button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">{t('chatUi.mediaEmpty')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((p) => <MediaThumb key={p.url} payload={p} onOpen={onOpen} />)}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-4">{t('chatUi.mediaNote')}</p>
    </div>
  </div>
  );
};

// ---------------------------------------------------------------
// جسم المحادثة
// ---------------------------------------------------------------
const ChatBody: React.FC<{ me: string; other: string }> = ({ me, other }) => {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [local, setLocal] = useState<LocalKey | null>(null);
  const [theirs, setTheirs] = useState<PublicKeyInfo | null | undefined>(undefined);
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [plain, setPlain] = useState<Record<string, ChatPayload | null>>({});
  const plainRef = useRef(plain); plainRef.current = plain;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewer, setViewer] = useState<{ src: string; type: 'image' | 'video' } | null>(null);
  const [activeMsg, setActiveMsg] = useState<RawMessage | null>(null);
  const [replyTo, setReplyTo] = useState<RawMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<RawMessage | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [sheet, setSheet] = useState<null | 'theme' | 'media' | 'report'>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const [prefs, setPrefs] = useState<ChatPrefMap>({});
  const [blockedIds, setBlockedIds] = useState<Set<string>>(() => new Set());
  const [reporting, setReporting] = useState(false);
  const [pending, setPending] = useState<{ file: File; url: string }[]>([]);
  const [caption, setCaption] = useState('');
  const [sendingPending, setSendingPending] = useState(false);
  const [editing, setEditing] = useState<RawMessage | null>(null);
  const [pinIdx, setPinIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [mentionDismissed, setMentionDismissed] = useState('');
  const decSigRef = useRef<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const purgedRef = useRef<Set<string>>(new Set());

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const press = useRef<{ timer: number | null; x: number; y: number }>({ timer: null, x: 0, y: 0 });
  const markingRef = useRef(false);

  useEffect(() => subscribeConversations(me, setConvs), [me]);
  const conv = convs?.find((c) => c.id === other || c.id === convIdOf(me, other)) || null;
  const isGroup: boolean | undefined = convs === null ? undefined : conv?.type === 'group';
  const convId = isGroup ? other : convIdOf(me, other);
  const theme = themeOf(conv?.theme);

  const memberUids = isGroup ? (conv?.members || []) : [other];
  const briefs = useUserBriefs(memberUids);
  const myShow = (profile as any)?.showActivity !== false;
  const presence = usePresenceInfo(isGroup ? [] : [other], myShow);
  const otherPresence = isGroup ? undefined : presence[other];
  const isOnline = !!otherPresence?.online;
  const presenceText = formatPresence(otherPresence, lang);

  const nameOf = (uid: string) => (uid === me ? t('chatUi.you') : briefs[uid]?.displayName || t('chatUi.member'));

  useEffect(() => subscribeChatPrefs(me, setPrefs), [me]);
  useEffect(() => subscribeBlockedIds(me, setBlockedIds), [me]);
  const pref = prefs[convId];
  const iBlocked = isGroup === false && blockedIds.has(other);
  const disappearAfter = conv?.disappearAfter || 0;

  useEffect(() => {
    if (!disappearAfter) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [disappearAfter]);

  const deletedAt = pref?.deletedAt || 0;
  const visibleMessages = useMemo(
    () => messages.filter((m) => {
      if (isExpired(m, disappearAfter, now)) return false;
      if (deletedAt) {
        const ms: number | undefined = m.createdAt?.toMillis?.();
        if (ms !== undefined && ms <= deletedAt) return false;
      }
      return true;
    }),
    [messages, disappearAfter, now, deletedAt]
  );

  useEffect(() => {
    if (!disappearAfter) return;
    const mine = messages.filter((m) => m.senderId === me && isExpired(m, disappearAfter, now) && !purgedRef.current.has(m.id));
    if (!mine.length) return;
    mine.forEach((m) => purgedRef.current.add(m.id));
    Promise.allSettled(mine.map((m) => removeMessage(convId, m.id))).catch(console.error);
  }, [messages, disappearAfter, now, convId, me]);

  const q = searchQ.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!searchOpen || !q) return [] as string[];
    return visibleMessages
      .filter((m) => { const p = plain[m.id]; return !!p && ((p.k === 't' && p.v.toLowerCase().includes(q)) || (p.k === 'm' && !!(p as MediaPayload).c && (p as MediaPayload).c!.toLowerCase().includes(q))); })
      .map((m) => m.id);
  }, [searchOpen, q, visibleMessages, plain]);
  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);
  const safeIdx = matchIds.length ? Math.min(searchIdx, matchIds.length - 1) : 0;
  const currentMatch: string | undefined = matchIds[safeIdx];

  useEffect(() => { setSearchIdx(Math.max(0, matchIds.length - 1)); }, [q, matchIds.length]);
  useEffect(() => {
    if (!currentMatch) return;
    document.getElementById(`msg-${currentMatch}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentMatch]);

  const mediaItems = useMemo(
    () => visibleMessages
      .map((m) => plain[m.id])
      .filter((p): p is MediaPayload => !!p && p.k === 'm')
      .reverse(),
    [visibleMessages, plain]
  );

  useEffect(() => {
    let off = false;
    (async () => {
      const l = await getLocalKey(me);
      if (!off) setLocal(l);
    })().catch(console.error);
    return () => { off = true; };
  }, [me]);

  useEffect(() => {
    if (isGroup !== false) return;
    let off = false;
    getPublicKeyInfo(other)
      .then((k) => { if (!off) setTheirs(k); })
      .catch((e) => { console.error(e); if (!off) setTheirs(null); });
    return () => { off = true; };
  }, [isGroup, other]);

  useEffect(() => {
    if (isGroup === undefined) return;
    setMessages([]); setPlain({}); decSigRef.current = {};
    return subscribeMessages(convId, setMessages, (e) => console.error('messages error:', e));
  }, [isGroup, convId]);

  useEffect(() => {
    if (isGroup === undefined || !local) return;
    if (!isGroup && theirs === undefined) return;
    let off = false;
    (async () => {
      const next: Record<string, ChatPayload | null> = {};
      for (const m of messages) {
        if (m.id in plainRef.current && decSigRef.current[m.id] === m.iv) continue;
        next[m.id] = isGroup ? await decryptGroupMessage(me, local, m) : await decryptMessage(me, local, theirs ?? null, m);
        decSigRef.current[m.id] = m.iv;
      }
      if (!off && Object.keys(next).length) setPlain((p) => ({ ...p, ...next }));
    })();
    return () => { off = true; };
  }, [isGroup, messages, local, theirs, me]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [visibleMessages.length]);

  useEffect(() => {
    if (!conv || markingRef.current || !isUnread(conv, me)) return;
    markingRef.current = true;
    markConversationRead(conv.id, me).catch(console.error).finally(() => { markingRef.current = false; });
  }, [conv, me]);

  useEffect(() => {
    if (!viewer) return;
    window.history.pushState({ ...(window.history.state || {}), avViewer: 1 }, '');
    const onPop = () => setViewer(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [!!viewer]);
  const closeViewer = () => {
    if (window.history.state?.avViewer) window.history.back();
    else setViewer(null);
  };

  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(''), 2200); };

  const errText = (e: any): string => {
    const c = String(e?.message || '');
    if (c === 'RECIPIENT_NO_KEY') return t('chat.noKey');
    if (c === 'MESSAGES_CLOSED') return t('chatUi.messagesClosed');
    if (c === 'NO_LOCAL_KEY') return t('chat.errorGate');
    if (e?.code === 'permission-denied') return t('chatUi.permissionDenied');
    return `${t('chat.sendFailed')}${c ? ` (${c})` : ''}`;
  };

  const doSend = async (payload: ChatPayload): Promise<boolean> => {
    if (iBlocked) { setError(t('chatUi.youBlocked')); return false; }
    setBusy(true); setError('');
    try {
      if (isGroup) await sendGroup(me, other, conv?.members || [], payload, replyTo?.id);
      else await sendDirect(me, other, payload, !!conv, replyTo?.id);
      setReplyTo(null);
      return true;
    } catch (e: any) {
      console.error(e);
      setError(errText(e));
      return false;
    } finally { setBusy(false); }
  };

  const notifyMentions = async (v: string) => {
    const names = extractMentions(v).slice(0, 5);
    if (!names.length) return;
    const members = new Set<string>(isGroup ? (conv?.members || []) : [other]);
    for (const n of names) {
      try {
        const snap = await getDoc(fsDoc(db, 'usernames', n));
        const uid = snap.exists() ? String((snap.data() as any).uid || '') : '';
        if (!uid || uid === me || !members.has(uid)) continue;
        const where = isGroup ? pick(lang, 'في مجموعة', 'in a group', 'dans un groupe') : pick(lang, 'في رسالة', 'in a message', 'dans un message');
        await notify(uid, 'mention' as any, `${pick(lang, 'أشار إليك', 'mentioned you', 'vous a mentionné')} ${where}: ${v.slice(0, 120)}`, isGroup ? other : me);
      } catch (e) { console.error('mention notify failed:', e); }
    }
  };

  const sendText = async () => {
    const v = text.trim();
    if (!v || busy) return;
    if (await doSend({ k: 't', v: v.slice(0, 1500) })) {
      setText('');
      notifyMentions(v).catch(console.error);
    }
  };

  const cancelEdit = () => { setEditing(null); setText(''); };

  const startEdit = (m: RawMessage) => {
    const p = plain[m.id];
    if (!p || p.k !== 't' || m.senderId !== me) return;
    setReplyTo(null);
    setEditing(m);
    setText(p.v);
    setError('');
  };

  const saveEdit = async () => {
    const v = text.trim();
    if (!editing || !v || busy) return;
    const p = plain[editing.id];
    if (!p || p.k !== 't') { cancelEdit(); return; }
    if (v === p.v) { cancelEdit(); return; }
    setBusy(true); setError('');
    try {
      const payload: ChatPayload = { ...p, v: v.slice(0, 1500) };
      if (isGroup) await editGroup(me, other, conv?.members || [], editing, payload);
      else await editDirect(me, other, editing, payload);
      setPlain((prev) => ({ ...prev, [editing.id]: payload }));
      setEditing(null);
      setText('');
      notifyMentions(v).catch(console.error);
    } catch (e: any) {
      console.error(e);
      const c = String(e?.message || '');
      if (e?.code === 'permission-denied') setError(t('chatUi.permissionDenied'));
      else if (c === 'KEY_CHANGED' || c === 'NO_LOCAL_KEY') setError(pick(lang, 'تعذّر التعديل بسبب تغيّر مفتاح التشفير', 'Cannot edit: the encryption key changed', 'Modification impossible : la clé de chiffrement a changé'));
      else setError(pick(lang, 'فشل تعديل الرسالة', 'Failed to edit the message', 'Échec de la modification'));
    } finally { setBusy(false); }
  };

  const pinnedIds = conv?.pinned || [];
  const pinnedVisible = pinnedIds.filter((id) => visibleMessages.some((m) => m.id === id));
  const pinSafe = pinnedVisible.length ? pinIdx % pinnedVisible.length : 0;
  const pinnedCurrentId: string | undefined = pinnedVisible[pinSafe];

  const togglePin = async (m: RawMessage) => {
    if (!conv) { setError(t('chatUi.needConv')); return; }
    const isPinned = pinnedIds.includes(m.id);
    const next = isPinned ? pinnedIds.filter((x) => x !== m.id) : [m.id, ...pinnedIds].slice(0, MAX_PINNED);
    try {
      await setPinnedMessages(convId, next);
      setPinIdx(0);
      flash(isPinned ? pick(lang, 'تم إلغاء التثبيت', 'Unpinned', 'Désépinglé') : pick(lang, 'تم تثبيت الرسالة 📌', 'Message pinned 📌', 'Message épinglé 📌'));
    } catch (e) {
      console.error(e);
      setError(pick(lang, 'فشل تثبيت الرسالة', 'Failed to pin the message', 'Échec de l’épinglage'));
    }
  };

  const goToPinned = () => {
    if (!pinnedCurrentId) return;
    document.getElementById(`msg-${pinnedCurrentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPinIdx((i) => i + 1);
  };

  const downloadSrc = async (src: string, fallbackMime: string) => {
    if (downloading) return;
    setDownloading(true);
    try {
      await saveMediaToDevice(src, fallbackMime);
      flash(pick(lang, 'تم الحفظ ✓', 'Saved ✓', 'Enregistré ✓'));
    } catch (e) {
      console.error(e);
      setError(pick(lang, 'فشل التنزيل', 'Download failed', 'Échec du téléchargement'));
    } finally { setDownloading(false); }
  };

  const downloadMessageMedia = async (m: RawMessage) => {
    const p = plain[m.id];
    if (!p || p.k !== 'm') return;
    try {
      const src = await ensureMediaSrc(p);
      await downloadSrc(src, p.mime);
    } catch (e) {
      console.error(e);
      setError(pick(lang, 'فشل التنزيل', 'Download failed', 'Échec du téléchargement'));
    }
  };

  const mentionMatch = /(^|\s)@([a-zA-Z0-9_.]*)$/.exec(text);
  const mentionQuery = mentionMatch ? mentionMatch[2].toLowerCase() : null;
  const mentionOptions = mentionQuery === null || mentionDismissed === text ? [] : memberUids
    .filter((u) => u !== me)
    .map((u) => briefs[u])
    .filter((b): b is NonNullable<typeof b> => !!b && !!b.username && b.username.toLowerCase().startsWith(mentionQuery))
    .slice(0, 5);
  const pickMention = (username: string) => {
    setText((cur) => cur.replace(/@([a-zA-Z0-9_.]*)$/, `@${username} `));
  };

  const sendVoice = async (r: VoiceResult | null) => {
    if (!r) return;
    setBusy(true); setError('');
    try {
      const enc = await encryptBlob(r.blob);
      const url = await uploadEncryptedBlob(enc.data);
      rememberMedia(url, r.blob);
      setBusy(false);
      await doSend({ k: 'v', url, key: enc.key, iv: enc.iv, dur: r.duration, mime: r.mime });
    } catch (e: any) {
      console.error(e);
      setError(`${t('chat.sendFailed')} (${e?.message || e?.name || ''})`.trim());
      setBusy(false);
    }
  };

  const sendOneMedia = async (file: File, cap?: string): Promise<boolean> => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { setError(t('chat.mediaType')); return false; }
    if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) { setError(t('chat.videoTooBig', { mb: MAX_VIDEO_MB })); return false; }

    setBusy(true); setError(''); setProgress(0);
    try {
      let blob: Blob = file; let mime = file.type; let w: number | undefined; let h: number | undefined;
      if (isImage && mime !== 'image/gif') { const c = await compressImage(file); blob = c.blob; mime = c.mime; w = c.w; h = c.h; }
      const enc = await encryptBlob(blob);
      const url = await uploadEncryptedBlob(enc.data, setProgress);
      rememberMedia(url, blob); setBusy(false);
      const payload: MediaPayload = { k: 'm', url, key: enc.key, iv: enc.iv, mime, size: blob.size };
      if (w && h) { payload.w = w; payload.h = h; }
      if (cap) payload.c = cap.slice(0, 1000);
      return await doSend(payload);
    } catch (e: any) { console.error(e); setError(`${t('chat.sendFailed')} (${e?.message || ''})`.trim()); setBusy(false); return false; }
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []).slice(0, MAX_ATTACH_PER_PICK);
    e.target.value = '';
    if (!files.length || busy) return;
    const okFiles: File[] = [];
    for (const f of files) {
      const isImg = f.type.startsWith('image/');
      const isVid = f.type.startsWith('video/');
      if (!isImg && !isVid) { setError(t('chat.mediaType')); continue; }
      if (isVid && f.size > MAX_VIDEO_MB * 1024 * 1024) { setError(t('chat.videoTooBig', { mb: MAX_VIDEO_MB })); continue; }
      okFiles.push(f);
    }
    if (!okFiles.length) return;
    setCaption('');
    setPending(okFiles.map((f) => ({ file: f, url: URL.createObjectURL(f) })));
  };

  const closePending = () => {
    pending.forEach((x) => URL.revokeObjectURL(x.url));
    setPending([]);
    setCaption('');
  };

  const sendPending = async () => {
    if (!pending.length || sendingPending) return;
    const items = pending;
    const cap = caption.trim();
    setSendingPending(true);
    for (let i = 0; i < items.length; i++) {
      const ok = await sendOneMedia(items[i].file, i === 0 && cap ? cap : undefined);
      if (!ok) break;
    }
    setProgress(null);
    setSendingPending(false);
    if (cap) notifyMentions(cap).catch(console.error);
    closePending();
  };

  const { recording, seconds, start, stop, cancel } = useVoiceRecorder(sendVoice);
  const startRec = async () => {
    setError('');
    try { await start(); }
    catch (e: any) {
      console.error(e);
      setError(e?.name === 'NotFoundError' || !navigator.mediaDevices ? t('chat.micMissing') : `${t('chat.micDenied')} ${t('chat.micSettingsHint')}`);
    }
  };
  const finishRec = async () => {
    const r = await stop();
    if (!r) { setError(t('chatUi.recTooShort')); return; }
    await sendVoice(r);
  };

  const react = (m: RawMessage, emoji: string) => {
    const has = !!m.reactions?.[emoji]?.includes(me);
    toggleReaction(convId, m.id, emoji, me, has).catch((e) => { console.error(e); setError(t('chatUi.reactFail')); });
  };

  const forwardTo = async (c: Conversation) => {
    const src = forwardMsg;
    setForwardMsg(null);
    const p = src ? plain[src.id] : null;
    if (!p) { setError(t('chatUi.cannotForward')); return; }
    const payload = { ...p, f: 1 } as ChatPayload;
    try {
      if (c.type === 'group') await sendGroup(me, c.id, c.members || [], payload);
      else await sendDirect(me, c.otherUid, payload, true);
      flash(t('chatUi.forwarded'));
    } catch (e: any) { console.error(e); setError(errText(e)); }
  };

  const clearPress = () => { if (press.current.timer) { clearTimeout(press.current.timer); press.current.timer = null; } };
  const startPress = (e: React.PointerEvent, m: RawMessage) => {
    clearPress();
    press.current.x = e.clientX; press.current.y = e.clientY;
    press.current.timer = window.setTimeout(() => {
      setActiveMsg(m);
      try { navigator.vibrate?.(15); } catch { /* ignore */ }
    }, 420);
  };
  const movePress = (e: React.PointerEvent) => {
    if (Math.abs(e.clientX - press.current.x) > 10 || Math.abs(e.clientY - press.current.y) > 10) clearPress();
  };

  const name = isGroup ? (conv?.name || t('chatUi.group')) : (briefs[other]?.displayName || '...');
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const needConv = (): boolean => {
    if (conv) return true;
    setError(t('chatUi.needConv'));
    return false;
  };

  const closeSearch = () => { setSearchOpen(false); setSearchQ(''); setSearchIdx(0); };

  const toggleMute = () => {
    setShowOptions(false);
    const next = !pref?.muted;
    setChatPref(me, convId, { muted: next }, pref)
      .then(() => flash(next ? t('chatUi.muted') : t('chatUi.unmuted')))
      .catch((e) => { console.error(e); setError(t('chatUi.muteFail')); });
  };

  const toggleRestrict = async () => {
    setShowOptions(false);
    const next = !pref?.restricted;
    try {
      if (next) {
        const ok = await confirm({
          title: t('chatUi.restrictTitle', { name }),
          message: t('chatUi.restrictMsg'),
          confirmLabel: t('chatUi.restrictConfirm'),
          danger: true,
        });
        if (!ok) return;
        await setChatPref(me, convId, { restricted: true, muted: true }, pref);
        flash(t('chatUi.restricted'));
      } else {
        await setChatPref(me, convId, { restricted: false }, pref);
        flash(t('chatUi.unrestricted'));
      }
    } catch (e) {
      console.error(e);
      setError(t('chatUi.restrictFail'));
    }
  };

  const toggleDisappear = async () => {
    setShowOptions(false);
    if (!needConv()) return;
    try {
      if (disappearAfter > 0) {
        await setDisappearAfter(convId, 0);
        flash(t('chatUi.disappearOff'));
        return;
      }
      const ok = await confirm({
        title: t('chatUi.disappearTitle'),
        message: t('chatUi.disappearMsg'),
        confirmLabel: t('chatUi.enable'),
      });
      if (!ok) return;
      await setDisappearAfter(convId, DISAPPEAR_24H_MS);
      flash(t('chatUi.disappearOn'));
    } catch (e) {
      console.error(e);
      setError(t('chatUi.disappearFail'));
    }
  };

  const toggleBlock = async () => {
    setShowOptions(false);
    try {
      if (iBlocked) {
        await unblockUser(me, other);
        flash(t('chatUi.unblocked'));
        return;
      }
      const ok = await confirm({
        title: t('chatUi.blockTitle', { name }),
        message: t('chatUi.blockMsg'),
        confirmLabel: t('chatUi.blockConfirm'),
        danger: true,
      });
      if (!ok) return;
      await blockUser(me, other);
      flash(t('chatUi.blockedDone'));
    } catch (e) {
      console.error(e);
      setError(t('chatUi.blockFail'));
    }
  };

  const submitReport = async (kind: ReportKind, reason: string) => {
    setReporting(true);
    try {
      await reportUser(me, other, kind, reason);
      setSheet(null);
      flash(t('chatUi.reported'));
    } catch (e: any) {
      console.error(e);
      setSheet(null);
      setError(e?.code === 'permission-denied' ? t('chatUi.reportPermission') : t('chatUi.reportFail'));
    } finally {
      setReporting(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-x-0 z-30 mx-auto max-w-2xl flex flex-col ${theme.id !== 'default' ? 'keep-dark' : ''}`}
        style={{ top: 'var(--app-header-h, calc(env(safe-area-inset-top) + 3.75rem))', bottom: 0, background: theme.bg }}
      >
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 shrink-0 chat-bar backdrop-blur">
          <button onClick={() => navigate('/messages')} className="p-2 rounded-xl hover:bg-white/10 text-slate-200"><BackIcon className="w-5 h-5" /></button>
          <button onClick={() => !isGroup && navigate(`/user/${other}`)} className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative shrink-0">
              {isGroup ? (
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-white/10"><Users className="w-5 h-5 text-slate-400" /></div>
              ) : (
                <Avatar src={briefs[other]?.photoURL} seed={other} name={name} className="w-10 h-10 rounded-full object-cover bg-dark-900" />
              )}
              {isOnline && <span className={`absolute bottom-0 end-0 w-3 h-3 ${PRESENCE_DOT_CLASS}`} />}
            </div>
            <div className="min-w-0 text-start">
              <p className="text-sm font-black text-white truncate">{name}</p>
              {presenceText
                ? <p className={`text-[11px] truncate ${isOnline ? 'text-primary-400 font-bold' : 'text-slate-300'}`}>{presenceText}</p>
                : <p className="text-[10px] text-emerald-400 flex items-center gap-1"><Lock className="w-3 h-3" /> {t('chat.encrypted')}</p>}
            </div>
          </button>
          <button onClick={() => setShowOptions(true)} className="p-2 rounded-xl hover:bg-white/10 text-slate-200" aria-label={t('chatUi.optionsAria')}><MoreVertical className="w-5 h-5" /></button>
        </div>

        {searchOpen && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0 chat-bar">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              autoFocus
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t('chatUi.searchPlaceholder')}
              className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            {q && <span className="text-[11px] text-slate-300 tabular-nums shrink-0">{matchIds.length ? `${safeIdx + 1}/${matchIds.length}` : t('chatUi.noResults')}</span>}
            <button onClick={() => setSearchIdx(Math.max(0, safeIdx - 1))} disabled={!matchIds.length || safeIdx <= 0} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 disabled:opacity-30" aria-label={t('chatUi.older')}><ChevronUp className="w-4 h-4" /></button>
            <button onClick={() => setSearchIdx(Math.min(matchIds.length - 1, safeIdx + 1))} disabled={!matchIds.length || safeIdx >= matchIds.length - 1} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200 disabled:opacity-30" aria-label={t('chatUi.newer')}><ChevronDown className="w-4 h-4" /></button>
            <button onClick={closeSearch} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200" aria-label={t('chatUi.closeSearch')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {disappearAfter > 0 && (
          <div className="px-4 py-1.5 text-[11px] text-center text-primary-300 chat-bar shrink-0 flex items-center justify-center gap-1.5 border-b border-white/5">
            <Timer className="w-3 h-3" /> {t('chatUi.disappearBar')}
          </div>
        )}

        {pinnedCurrentId && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 shrink-0 chat-bar">
            <Pin className="w-4 h-4 text-primary-400 shrink-0" />
            <button type="button" onClick={goToPinned} className="flex-1 min-w-0 text-start">
              <p className="text-[10px] text-primary-400 font-bold">
                {pick(lang, 'رسالة مثبّتة', 'Pinned message', 'Message épinglé')}{pinnedVisible.length > 1 ? ` ${pinSafe + 1}/${pinnedVisible.length}` : ''}
              </p>
              <p className="text-xs text-slate-200 truncate">{previewOf(plain[pinnedCurrentId], t)}</p>
            </button>
            <button
              type="button"
              onClick={() => { const m = messages.find((x) => x.id === pinnedCurrentId); if (m) togglePin(m); }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
              aria-label={pick(lang, 'إلغاء التثبيت', 'Unpin', 'Désépingler')}
            >
              <PinOff className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-2">
          {visibleMessages.map((m) => {
            const mine = m.senderId === me;
            const p = plain[m.id];
            const isMedia = !!p && p.k === 'm';
            const time = m.createdAt?.toDate?.() ? m.createdAt.toDate().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) : '';
            const repliedMsg = m.replyTo ? messages.find((x) => x.id === m.replyTo) : null;
            const reactions = (Object.entries(m.reactions || {}) as [string, string[]][]).filter(([, u]) => Array.isArray(u) && u.length > 0);

            return (
              <div key={m.id} id={`msg-${m.id}`} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && isGroup && (<span className="text-[10px] text-slate-300 mb-1 px-1">{nameOf(m.senderId)}</span>)}
                <div className="relative max-w-[80%]">
                  <div
                    onPointerDown={(e) => startPress(e, m)}
                    onPointerMove={movePress}
                    onPointerUp={clearPress}
                    onPointerCancel={clearPress}
                    onPointerLeave={clearPress}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ ...(mine ? { background: theme.mine } : {}), WebkitTouchCallout: 'none' } as React.CSSProperties}
                    className={`rounded-2xl text-sm break-words select-none text-white ${isMedia ? 'p-1.5' : 'px-3 py-2'} ${mine ? 'keep-dark' : 'bg-white/10'} ${m.id === currentMatch ? 'ring-2 ring-amber-400' : matchSet.has(m.id) ? 'ring-1 ring-white/50' : ''}`}
                  >
                    {p?.f ? <p className="text-[10px] opacity-70 mb-1 flex items-center gap-1"><Share2 className="w-3 h-3" /> {t('chatUi.forwardedTag')}</p> : null}
                    {repliedMsg && (
                      <div className="chat-quote text-[11px] p-2 rounded-lg mb-2 border-s-2">
                        <p className="font-bold opacity-80 mb-0.5">{nameOf(repliedMsg.senderId)}</p>
                        <p className="opacity-70 truncate">{previewOf(plain[repliedMsg.id], t)}</p>
                      </div>
                    )}
                    {p === undefined ? (<Loader2 className="w-4 h-4 animate-spin" />)
                      : p === null ? (<span className="text-xs opacity-70">{t('chat.undecryptable')}</span>)
                      : p.k === 't' ? (<p className="selectable whitespace-pre-wrap">{renderWithMentions(p.v)}</p>)
                      : p.k === 'm' ? (<MediaBubble payload={p} onOpen={(src, type) => setViewer({ src, type })} />)
                      : p.k === 'v' ? (<VoiceBubble payload={p} />) : null}
                    <div className={`flex items-center justify-end gap-2 mt-1 ${isMedia ? 'px-1.5 pb-0.5' : ''}`}>
                      {pinnedIds.includes(m.id) && <Pin className="w-3 h-3 opacity-70" />}
                      {m.edited && <span className="text-[10px] opacity-60">{pick(lang, 'معدّلة', 'edited', 'modifié')}</span>}
                      <span className="text-[10px] opacity-60">{time}</span>
                    </div>
                  </div>

                  {reactions.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                      {reactions.map(([emoji, users]) => (
                        <button
                          key={emoji}
                          onClick={() => react(m, emoji)}
                          className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 border ${users.includes(me) ? 'bg-primary-500/30 border-primary-400/60' : 'chat-chip border-white/10'}`}
                        >
                          <span>{emoji}</span>{users.length > 1 && <span className="text-[10px] text-slate-200">{users.length}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 border-t border-white/10 chat-bar-strong px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm">
          {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg mb-2">{error}</p>}
          {notice && <p className="text-xs text-emerald-300 bg-emerald-500/10 p-2 rounded-lg mb-2">{notice}</p>}
          {replyTo && (
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg mb-2 border-s-2 border-primary-500">
              <div className="min-w-0">
                <p className="text-[10px] text-primary-400 font-bold mb-0.5">{t('chatUi.replyingTo', { name: nameOf(replyTo.senderId) })}</p>
                <p className="text-xs text-slate-300 truncate">{previewOf(plain[replyTo.id], t)}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          )}
          {editing && (
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg mb-2 border-s-2 border-amber-400">
              <div className="min-w-0">
                <p className="text-[10px] text-amber-300 font-bold mb-0.5 flex items-center gap-1"><Pencil className="w-3 h-3" /> {pick(lang, 'تعديل الرسالة', 'Editing message', 'Modification du message')}</p>
                <p className="text-xs text-slate-300 truncate">{previewOf(plain[editing.id], t)}</p>
              </div>
              <button onClick={cancelEdit} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          )}
          {mentionOptions.length > 0 && (
            <div className="mb-2 rounded-2xl bg-dark-900 border border-white/10 overflow-hidden divide-y divide-white/5">
              {mentionOptions.map((b) => (
                <button key={b.uid} type="button" onClick={() => pickMention(b.username as string)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 active:bg-white/10 text-start">
                  <Avatar src={b.photoURL} seed={b.uid} name={b.displayName} className="w-8 h-8 rounded-full object-cover" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white truncate">{b.displayName}</span>
                    <span className="block text-[11px] text-slate-400 truncate">@{b.username}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {progress !== null && (
            <div className="mb-2"><div className="flex items-center justify-between text-[11px] text-slate-400 mb-1"><span>{t('chat.uploading')}</span><span className="tabular-nums">{progress}%</span></div><div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all" style={{ width: `${progress}%` }} /></div></div>
          )}

          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />

          {iBlocked ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
              <p className="text-xs text-slate-300 flex items-center gap-2"><Ban className="w-4 h-4 text-red-400 shrink-0" /> {t('chatUi.youBlockedBar')}</p>
              <button onClick={toggleBlock} className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-300 text-xs font-bold shrink-0">{t('chatUi.unblock')}</button>
            </div>
          ) : recording ? (
            <div className="flex items-center gap-3">
              <button onClick={cancel} className="p-3 rounded-full bg-white/5 border border-white/10 text-red-400 active:scale-90 transition"><Trash2 className="w-4 h-4" /></button>
              <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl bg-dark-900 border border-red-500/30">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-white tabular-nums">{fmt(seconds)}</span>
                <span className="text-xs text-slate-400">{t('chat.recording')}</span>
              </div>
              <button onClick={finishRec} className="btn-primary p-3 rounded-full active:scale-90 transition"><Send className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (editing) saveEdit(); else sendText(); } else if (e.key === 'Escape') { if (editing) cancelEdit(); else setMentionDismissed(text); } }} maxLength={1500} placeholder={t('chat.placeholder')} className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm outline-none focus:border-primary-500" />
              {!editing && <button onClick={() => fileRef.current?.click()} disabled={busy} className="p-3 rounded-full bg-white/5 border border-white/10 text-slate-300 active:scale-90 transition disabled:opacity-50"><Paperclip className="w-4 h-4" /></button>}
              {editing ? (
                <button onClick={saveEdit} disabled={busy || !text.trim()} className="btn-primary p-3 rounded-full disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}</button>
              ) : text.trim() ? (
                <button onClick={sendText} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
              ) : (
                <button onClick={startRec} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}</button>
              )}
            </div>
          )}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="fixed inset-0 z-[125] bg-black/95 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={closePending} disabled={sendingPending} className="p-2 rounded-full bg-white/10 text-white disabled:opacity-50"><X className="w-5 h-5" /></button>
            <span className="text-sm font-bold text-white">{pending.length > 1 ? `${pending.length}` : ''}</span>
            <span className="w-9" />
          </div>
          <div className="flex-1 min-h-0 flex items-center gap-3 overflow-x-auto px-4 snap-x snap-mandatory">
            {pending.map((x) => (
              <div key={x.url} className="snap-center shrink-0 w-full h-full flex items-center justify-center">
                {x.file.type.startsWith('video/')
                  ? <video src={x.url} controls playsInline className="max-w-full max-h-full rounded-xl" />
                  : <img src={x.url} alt="" draggable={false} className="max-w-full max-h-full object-contain rounded-xl" />}
              </div>
            ))}
          </div>
          {sendingPending && progress !== null && (
            <div className="px-4 pt-3"><div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all" style={{ width: `${progress}%` }} /></div></div>
          )}
          <div className="flex items-center gap-2 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendPending()}
              maxLength={1000}
              disabled={sendingPending}
              placeholder={lang === 'ar' ? 'أضف نصاً...' : lang === 'fr' ? 'Ajouter un texte...' : 'Add a caption...'}
              className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
            />
            <button onClick={sendPending} disabled={sendingPending} className="btn-primary p-3 rounded-full disabled:opacity-50">
              {sendingPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[130] bg-black flex items-center justify-center" onClick={closeViewer}>
          <button
            onClick={(e) => { e.stopPropagation(); closeViewer(); }}
            className="absolute start-4 p-2.5 rounded-full bg-white/15 text-white z-10"
            style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
            aria-label={t('chatUi.back')}
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); downloadSrc(viewer.src, viewer.type === 'video' ? 'video/mp4' : 'image/jpeg'); }}
            disabled={downloading}
            className="absolute end-4 p-2.5 rounded-full bg-white/15 text-white z-10 disabled:opacity-50"
            style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
            aria-label={pick(lang, 'تنزيل', 'Download', 'Télécharger')}
          >
            {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          </button>
          {viewer.type === 'image'
            ? <img src={viewer.src} alt="" draggable={false} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain" />
            : <video src={viewer.src} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full" />}
        </div>
      )}

      {activeMsg && (
        <MessageSheet
          mine={activeMsg.senderId === me}
          canCopy={plain[activeMsg.id]?.k === 't'}
          canEdit={activeMsg.senderId === me && plain[activeMsg.id]?.k === 't'}
          canDownload={plain[activeMsg.id]?.k === 'm'}
          pinned={pinnedIds.includes(activeMsg.id)}
          myEmojis={(Object.entries(activeMsg.reactions || {}) as [string, string[]][]).filter(([, u]) => u?.includes(me)).map(([e]) => e)}
          onReact={(emoji) => { react(activeMsg, emoji); setActiveMsg(null); }}
          onReply={() => { setReplyTo(activeMsg); setActiveMsg(null); }}
          onForward={() => { setForwardMsg(activeMsg); setActiveMsg(null); }}
          onCopy={() => {
            const p = plain[activeMsg.id];
            if (p && p.k === 't') navigator.clipboard?.writeText(p.v).then(() => flash(t('chatUi.copied'))).catch(() => {});
            setActiveMsg(null);
          }}
          onEdit={() => { startEdit(activeMsg); setActiveMsg(null); }}
          onPin={() => { togglePin(activeMsg); setActiveMsg(null); }}
          onDownload={() => { const m = activeMsg; setActiveMsg(null); downloadMessageMedia(m); }}
          onDelete={async () => {
            const id = activeMsg.id; setActiveMsg(null);
            if (await confirm({ title: t('chatUi.deleteMsgTitle') })) removeMessage(convId, id).catch(console.error);
          }}
          onClose={() => setActiveMsg(null)}
        />
      )}

      {forwardMsg && (
        <ForwardModal convs={convs || []} onClose={() => setForwardMsg(null)} onPick={forwardTo} />
      )}

      {showOptions && (
        <ChatOptionsSheet
          isGroup={!!isGroup}
          name={name}
          muted={!!pref?.muted}
          restricted={!!pref?.restricted}
          blocked={iBlocked}
          disappearing={disappearAfter > 0}
          onClose={() => setShowOptions(false)}
          onProfile={() => { setShowOptions(false); navigate(`/user/${other}`); }}
          onSearch={() => { setShowOptions(false); setSearchOpen(true); }}
          onToggleMute={toggleMute}
          onToggleDisappear={toggleDisappear}
          onTheme={() => { setShowOptions(false); if (needConv()) setSheet('theme'); }}
          onMedia={() => { setShowOptions(false); setSheet('media'); }}
          onToggleRestrict={toggleRestrict}
          onReport={() => { setShowOptions(false); setSheet('report'); }}
          onToggleBlock={toggleBlock}
        />
      )}

      {sheet === 'theme' && (
        <ThemeSheet
          current={theme.id}
          onPick={(id) => { setSheet(null); setConversationTheme(convId, id).catch((e) => { console.error(e); setError(t('chatUi.themeFail')); }); }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'media' && (
        <SharedMediaSheet
          items={mediaItems}
          onOpen={(src, type) => { setSheet(null); setViewer({ src, type }); }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'report' && (
        <ReportFlow
          targetType={isGroup ? 'group' : 'conversation'}
          targetId={convId}
          reportedUid={isGroup ? undefined : other}
          reportedName={name}
          link={isGroup ? undefined : profileLink(other)}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
};

const Chat: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const { user } = useAuth();
  if (!user || !uid) return null;
  return (
    <div className="px-4 pt-4">
      <E2EEGate>
        <ChatBody me={user.uid} other={uid} />
      </E2EEGate>
    </div>
  );
};

export default Chat;
