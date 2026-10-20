import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, Send, Mic, Trash2, Lock, Loader2, Play, Pause, X, Paperclip, RefreshCw,
  CornerUpLeft, Share2, Users, Plus, MoreVertical, Check, Copy, Maximize2, Palette
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { useConfirm } from '../components/ConfirmDialog';
import { useUserBriefs } from '../services/userCache';
import { usePresenceInfo, formatPresence, PRESENCE_DOT_CLASS } from '../services/presenceService';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type { VoiceResult } from '../hooks/useVoiceRecorder';
import { decryptBlob, encryptBlob, getLocalKey } from '../services/cryptoService';
import type { LocalKey } from '../services/cryptoService';
import { uploadEncryptedBlob } from '../services/cloudinaryService';
import { compressImage, formatBytes } from '../utils/media';
import {
  convIdOf, decryptMessage, decryptGroupMessage, getPublicKeyInfo, removeMessage, sendDirect, sendGroup,
  subscribeMessages, subscribeConversations, toggleReaction, setConversationTheme, markConversationRead, isUnread
} from '../services/chatService';
import type { ChatPayload, PublicKeyInfo, RawMessage, Conversation } from '../services/chatService';

type VoicePayload = Extract<ChatPayload, { k: 'v' }>;
type MediaPayload = Extract<ChatPayload, { k: 'm' }>;

const MAX_VIDEO_MB = 9;
const MAX_ATTACH_PER_PICK = 5;
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------
// الثيمات والخلفيات (تُحفظ في وثيقة المحادثة، فيراها الطرفان)
// ---------------------------------------------------------------
interface ChatTheme { id: string; label: string; bg: string; mine: string; }
const THEMES: ChatTheme[] = [
  { id: 'default', label: 'الافتراضي', bg: 'var(--av-chat-bg)', mine: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
  { id: 'dark', label: 'أسود', bg: '#000000', mine: 'linear-gradient(135deg,#334155,#475569)' },
  { id: 'romantic', label: 'رومانسي', bg: 'linear-gradient(160deg,#4a0d2e,#1a0510)', mine: 'linear-gradient(135deg,#ec4899,#f43f5e)' },
  { id: 'friends', label: 'أصدقاء', bg: 'linear-gradient(160deg,#0b2a5b,#06122b)', mine: 'linear-gradient(135deg,#3b82f6,#06b6d4)' },
  { id: 'sunset', label: 'غروب', bg: 'linear-gradient(160deg,#4a1d0a,#2a0a2e)', mine: 'linear-gradient(135deg,#f97316,#ec4899)' },
  { id: 'ocean', label: 'محيط', bg: 'linear-gradient(160deg,#032b3a,#04121f)', mine: 'linear-gradient(135deg,#06b6d4,#3b82f6)' },
  { id: 'forest', label: 'غابة', bg: 'linear-gradient(160deg,#0b3320,#04140c)', mine: 'linear-gradient(135deg,#10b981,#84cc16)' },
  { id: 'aurora', label: 'شفق', bg: 'linear-gradient(160deg,#1b0b3b,#052e2b)', mine: 'linear-gradient(135deg,#a855f7,#14b8a6)' },
  { id: 'sakura', label: 'ساكورا', bg: 'linear-gradient(160deg,#3b1030,#17081a)', mine: 'linear-gradient(135deg,#f472b6,#c084fc)' },
  { id: 'fire', label: 'نار', bg: 'linear-gradient(160deg,#3b0a0a,#140404)', mine: 'linear-gradient(135deg,#ef4444,#f59e0b)' },
  { id: 'midnight', label: 'منتصف الليل', bg: 'linear-gradient(160deg,#0f0c29,#302b63)', mine: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
  { id: 'mint', label: 'نعناع', bg: 'linear-gradient(160deg,#06302b,#0b1a2e)', mine: 'linear-gradient(135deg,#2dd4bf,#38bdf8)' },
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

const previewOf = (p: ChatPayload | null | undefined): string => {
  if (!p) return '🔒 رسالة';
  if (p.k === 't') return p.v;
  if (p.k === 'v') return '🎤 رسالة صوتية';
  return p.mime.startsWith('video/') ? '🎬 فيديو' : '📷 صورة';
};

const mediaCache = new Map<string, string>();
const rememberMedia = (url: string, blob: Blob) => { mediaCache.set(url, URL.createObjectURL(blob)); };

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
// الرسالة الصوتية: نفك التشفير مسبقاً عند ظهورها، فيعمل الضغط فوراً
// (التشغيل يجب أن يبدأ مباشرة داخل حدث الضغط، وإلا يمنعه الأندرويد)
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
        <button onClick={load} className="relative w-56 h-40 rounded-xl bg-black/40 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition">
          <span className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : failed ? <RefreshCw className="w-5 h-5" /> : <Play className="w-5 h-5" />}</span>
          <span className="text-[11px] opacity-80">{failed ? t('chat.mediaError') : `${t('chat.video')} • ${formatBytes(payload.size)}`}</span>
        </button>
      );
    }
    return (
      <div className="relative w-56">
        <video src={src} controls playsInline className="w-56 max-h-72 rounded-xl bg-black" />
        <button onClick={() => onOpen(src, 'video')} className="absolute top-2 end-2 p-1.5 rounded-full bg-black/60 text-white"><Maximize2 className="w-3.5 h-3.5" /></button>
      </div>
    );
  }
  const ratio = Math.min(1.8, Math.max(0.6, payload.w && payload.h ? payload.w / payload.h : 4 / 3));
  return (
    <div className="relative w-56 rounded-xl overflow-hidden bg-black/30" style={{ aspectRatio: String(ratio) }}>
      {src ? (<img src={src} alt="" draggable={false} onClick={() => onOpen(src, 'image')} className="w-full h-full object-cover cursor-pointer" />) :
       failed ? (<button onClick={load} className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs opacity-80"><RefreshCw className="w-5 h-5" /> {t('chat.mediaError')}</button>) :
       (<div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin opacity-70" /></div>)}
    </div>
  );
};

// ---------------------------------------------------------------
// قائمة الضغط المطوّل: 6 إيموجيات + زر (+) لكل الإيموجيات + رد/توجيه/نسخ/حذف
// ---------------------------------------------------------------
const MessageSheet: React.FC<{
  mine: boolean;
  canCopy: boolean;
  myEmojis: string[];
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ mine, canCopy, myEmojis, onReact, onReply, onForward, onCopy, onDelete, onClose }) => {
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
            <p className="text-[11px] text-slate-400 mb-2">افتح الإيموجي من لوحة مفاتيح هاتفك واختر ما تريد:</p>
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
          <button onClick={onReply} className={btn}><CornerUpLeft className="w-4 h-4 text-slate-300" /> رد</button>
          <button onClick={onForward} className={btn}><Share2 className="w-4 h-4 text-slate-300" /> إعادة توجيه</button>
          {canCopy && <button onClick={onCopy} className={btn}><Copy className="w-4 h-4 text-slate-300" /> نسخ</button>}
          {mine && <button onClick={onDelete} className={`${btn} !text-red-400`}><Trash2 className="w-4 h-4" /> حذف</button>}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// إعادة التوجيه
// ---------------------------------------------------------------
const ForwardModal: React.FC<{ convs: Conversation[]; onClose: () => void; onPick: (c: Conversation) => void }> = ({ convs, onClose, onPick }) => {
  const briefs = useUserBriefs(convs.filter((c) => c.type !== 'group').map((c) => c.otherUid));
  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-900 w-full max-w-sm rounded-2xl overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-white font-bold">إعادة التوجيه إلى...</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {convs.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">لا توجد محادثات.</p>}
          {convs.map((c) => {
            const isGroup = c.type === 'group';
            const b = !isGroup ? briefs[c.otherUid] : null;
            return (
              <button key={c.id} onClick={() => onPick(c)} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition">
                {isGroup
                  ? <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center"><Users className="w-5 h-5 text-slate-400" /></div>
                  : <Avatar src={b?.photoURL} seed={c.otherUid} name={b?.displayName} className="w-10 h-10 rounded-full object-cover" />}
                <span className="text-sm font-bold text-white truncate">{isGroup ? (c.name || 'مجموعة') : b?.displayName || '...'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// خيارات المحادثة (الثيمات والتدرجات)
// ---------------------------------------------------------------
const OptionsSheet: React.FC<{ current: string; onPick: (id: string) => void; onClose: () => void }> = ({ current, onPick, onClose }) => (
  <div className="fixed inset-0 z-[115] bg-black/60 flex items-end justify-center" onClick={onClose}>
    <div className="w-full max-w-md bg-dark-900 border-t border-white/10 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-black flex items-center gap-2"><Palette className="w-5 h-5 text-primary-400" /> ثيم وخلفية المحادثة</h3>
        <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {THEMES.map((th) => (
          <button key={th.id} onClick={() => onPick(th.id)} className="flex flex-col items-center gap-1.5">
            <span className="relative w-14 h-14 rounded-2xl border border-white/15 overflow-hidden flex items-end justify-end p-1.5" style={{ background: th.bg }}>
              <span className="w-6 h-3 rounded-full" style={{ background: th.mine }} />
              {current === th.id && <span className="absolute inset-0 bg-black/40 flex items-center justify-center"><Check className="w-5 h-5 text-white" /></span>}
            </span>
            <span className="text-[10px] text-slate-300 truncate max-w-full">{th.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-4">الثيم يُطبّق على هذه المحادثة فقط ويراه جميع المشاركين فيها.</p>
    </div>
  </div>
);

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

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const press = useRef<{ timer: number | null; x: number; y: number }>({ timer: null, x: 0, y: 0 });
  const markingRef = useRef(false);

  // ---- المحادثة (فردية أم مجموعة) ----
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

  const nameOf = (uid: string) => (uid === me ? 'أنت' : briefs[uid]?.displayName || 'عضو');

  // ---- مفاتيح التشفير ----
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

  // ---- الرسائل ----
  useEffect(() => {
    if (isGroup === undefined) return;
    setMessages([]); setPlain({});
    return subscribeMessages(convId, setMessages, (e) => console.error('messages error:', e));
  }, [isGroup, convId]);

  useEffect(() => {
    if (isGroup === undefined || !local) return;
    if (!isGroup && theirs === undefined) return;
    let off = false;
    (async () => {
      const next: Record<string, ChatPayload | null> = {};
      for (const m of messages) {
        if (m.id in plainRef.current) continue;
        next[m.id] = isGroup ? await decryptGroupMessage(me, local, m) : await decryptMessage(me, local, theirs ?? null, m);
      }
      if (!off && Object.keys(next).length) setPlain((p) => ({ ...p, ...next }));
    })();
    return () => { off = true; };
  }, [isGroup, messages, local, theirs, me]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // ---- علامة "مقروء" (تُطفئ النقطة الحمراء) ----
  useEffect(() => {
    if (!conv || markingRef.current || !isUnread(conv, me)) return;
    markingRef.current = true;
    markConversationRead(conv.id, me).catch(console.error).finally(() => { markingRef.current = false; });
  }, [conv, me]);

  // ---- شاشة معاينة الصور/الفيديو: زر الرجوع في الهاتف يغلقها ويبقيك في الدردشة ----
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
    if (c === 'MESSAGES_CLOSED') return 'هذا المستخدم لا يستقبل رسائل جديدة.';
    if (c === 'NO_LOCAL_KEY') return t('chat.errorGate');
    if (e?.code === 'permission-denied') return 'تم رفض الإرسال من الخادم. تأكد من نشر قواعد Firestore الجديدة.';
    return `${t('chat.sendFailed')}${c ? ` (${c})` : ''}`;
  };

  // ---- الإرسال ----
  const doSend = async (payload: ChatPayload): Promise<boolean> => {
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

  const sendText = async () => {
    const v = text.trim();
    if (!v || busy) return;
    if (await doSend({ k: 't', v: v.slice(0, 1500) })) setText('');
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

  const sendOneMedia = async (file: File): Promise<boolean> => {
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
      return await doSend(payload);
    } catch (e: any) { console.error(e); setError(`${t('chat.sendFailed')} (${e?.message || ''})`.trim()); setBusy(false); return false; }
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []).slice(0, MAX_ATTACH_PER_PICK);
    e.target.value = '';
    if (!files.length || busy) return;
    for (const f of files) { const ok = await sendOneMedia(f); if (!ok) break; }
    setProgress(null);
  };

  // ---- التسجيل الصوتي (يعمل في الفردي والمجموعات) ----
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
    if (!r) { setError('التسجيل قصير جداً.'); return; }
    await sendVoice(r);
  };

  // ---- التفاعلات / الرد / التوجيه ----
  const react = (m: RawMessage, emoji: string) => {
    const has = !!m.reactions?.[emoji]?.includes(me);
    toggleReaction(convId, m.id, emoji, me, has).catch((e) => { console.error(e); setError('تعذّر إرسال التفاعل.'); });
  };

  const forwardTo = async (c: Conversation) => {
    const src = forwardMsg;
    setForwardMsg(null);
    const p = src ? plain[src.id] : null;
    if (!p) { setError('لا يمكن توجيه هذه الرسالة.'); return; }
    const payload = { ...p, f: 1 } as ChatPayload;
    try {
      if (c.type === 'group') await sendGroup(me, c.id, c.members || [], payload);
      else await sendDirect(me, c.otherUid, payload, true);
      flash('تمت إعادة التوجيه ✓');
    } catch (e: any) { console.error(e); setError(errText(e)); }
  };

  // ---- الضغط المطوّل على الرسالة ----
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

  const name = isGroup ? (conv?.name || 'مجموعة') : (briefs[other]?.displayName || '...');
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <>
      <div
        className={`fixed inset-x-0 z-30 mx-auto max-w-2xl flex flex-col ${theme.id !== 'default' ? 'keep-dark' : ''}`}
        style={{ top: 'var(--app-header-h, calc(env(safe-area-inset-top) + 3.75rem))', bottom: 0, background: theme.bg }}
      >
        {/* الشريط العلوي */}
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
          <button onClick={() => setShowOptions(true)} className="p-2 rounded-xl hover:bg-white/10 text-slate-200"><MoreVertical className="w-5 h-5" /></button>
        </div>

        {/* الرسائل */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-2">
          {messages.map((m) => {
            const mine = m.senderId === me;
            const p = plain[m.id];
            const isMedia = !!p && p.k === 'm';
            const time = m.createdAt?.toDate?.() ? m.createdAt.toDate().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) : '';
            const repliedMsg = m.replyTo ? messages.find((x) => x.id === m.replyTo) : null;
            const reactions = (Object.entries(m.reactions || {}) as [string, string[]][]).filter(([, u]) => Array.isArray(u) && u.length > 0);

            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
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
                    className={`rounded-2xl text-sm break-words select-none text-white ${isMedia ? 'p-1.5' : 'px-3 py-2'} ${mine ? 'keep-dark' : 'bg-white/10'}`}
                  >
                    {p?.f ? <p className="text-[10px] opacity-70 mb-1 flex items-center gap-1"><Share2 className="w-3 h-3" /> معاد توجيهها</p> : null}
                    {repliedMsg && (
                      <div className="chat-quote text-[11px] p-2 rounded-lg mb-2 border-s-2">
                        <p className="font-bold opacity-80 mb-0.5">{nameOf(repliedMsg.senderId)}</p>
                        <p className="opacity-70 truncate">{previewOf(plain[repliedMsg.id])}</p>
                      </div>
                    )}
                    {p === undefined ? (<Loader2 className="w-4 h-4 animate-spin" />)
                      : p === null ? (<span className="text-xs opacity-70">{t('chat.undecryptable')}</span>)
                      : p.k === 't' ? (<p className="whitespace-pre-wrap">{p.v}</p>)
                      : p.k === 'm' ? (<MediaBubble payload={p} onOpen={(src, type) => setViewer({ src, type })} />)
                      : p.k === 'v' ? (<VoiceBubble payload={p} />) : null}
                    <div className={`flex items-center justify-end gap-3 mt-1 ${isMedia ? 'px-1.5 pb-0.5' : ''}`}>
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

        {/* شريط الإدخال */}
        <div className="shrink-0 border-t border-white/10 chat-bar-strong px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm">
          {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg mb-2">{error}</p>}
          {notice && <p className="text-xs text-emerald-300 bg-emerald-500/10 p-2 rounded-lg mb-2">{notice}</p>}
          {replyTo && (
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg mb-2 border-s-2 border-primary-500">
              <div className="min-w-0">
                <p className="text-[10px] text-primary-400 font-bold mb-0.5">الرد على {nameOf(replyTo.senderId)}</p>
                <p className="text-xs text-slate-300 truncate">{previewOf(plain[replyTo.id])}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          )}
          {progress !== null && (
            <div className="mb-2"><div className="flex items-center justify-between text-[11px] text-slate-400 mb-1"><span>{t('chat.uploading')}</span><span className="tabular-nums">{progress}%</span></div><div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all" style={{ width: `${progress}%` }} /></div></div>
          )}

          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />

          {recording ? (
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
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendText()} maxLength={1500} placeholder={t('chat.placeholder')} className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm outline-none focus:border-primary-500" />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="p-3 rounded-full bg-white/5 border border-white/10 text-slate-300 active:scale-90 transition disabled:opacity-50"><Paperclip className="w-4 h-4" /></button>
              {text.trim() ? (
                <button onClick={sendText} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
              ) : (
                <button onClick={startRec} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* معاينة الوسائط مع سهم رجوع للدردشة */}
      {viewer && (
        <div className="fixed inset-0 z-[130] bg-black flex items-center justify-center" onClick={closeViewer}>
          <button
            onClick={(e) => { e.stopPropagation(); closeViewer(); }}
            className="absolute start-4 p-2.5 rounded-full bg-white/15 text-white z-10"
            style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
            aria-label="رجوع"
          >
            <BackIcon className="w-5 h-5" />
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
          myEmojis={(Object.entries(activeMsg.reactions || {}) as [string, string[]][]).filter(([, u]) => u?.includes(me)).map(([e]) => e)}
          onReact={(emoji) => { react(activeMsg, emoji); setActiveMsg(null); }}
          onReply={() => { setReplyTo(activeMsg); setActiveMsg(null); }}
          onForward={() => { setForwardMsg(activeMsg); setActiveMsg(null); }}
          onCopy={() => {
            const p = plain[activeMsg.id];
            if (p && p.k === 't') navigator.clipboard?.writeText(p.v).then(() => flash('تم النسخ ✓')).catch(() => {});
            setActiveMsg(null);
          }}
          onDelete={async () => {
            const id = activeMsg.id; setActiveMsg(null);
            if (await confirm({ title: 'حذف الرسالة؟' })) removeMessage(convId, id).catch(console.error);
          }}
          onClose={() => setActiveMsg(null)}
        />
      )}

      {forwardMsg && (
        <ForwardModal convs={convs || []} onClose={() => setForwardMsg(null)} onPick={forwardTo} />
      )}

      {showOptions && (
        <OptionsSheet
          current={theme.id}
          onPick={(id) => { setShowOptions(false); setConversationTheme(convId, id).catch((e) => { console.error(e); setError('تعذّر تغيير الثيم. تأكد من نشر قواعد Firestore الجديدة.'); }); }}
          onClose={() => setShowOptions(false)}
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
