import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Send, Mic, Trash2, Lock, Loader2, Play, Pause, X, Paperclip, RefreshCw, CornerUpLeft, Share2, Users
} from 'lucide-react';
// --- استيراد دوال Firebase المفقودة ---
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { useConfirm } from '../components/ConfirmDialog';
import { useUserBriefs } from '../services/userCache';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type { VoiceResult } from '../hooks/useVoiceRecorder';
import { decryptBlob, encryptBlob, getLocalKey } from '../services/cryptoService';
import type { LocalKey } from '../services/cryptoService';
import { uploadEncryptedBlob } from '../services/cloudinaryService';
import { compressImage, formatBytes } from '../utils/media';
import {
  convIdOf, conversationExists, decryptMessage, getPublicKeyInfo, removeMessage, sendPayload, subscribeMessages, sendReaction, subscribeConversations
} from '../services/chatService';
import type { ChatPayload, PublicKeyInfo, RawMessage, Conversation } from '../services/chatService';

type VoicePayload = Extract<ChatPayload, { k: 'v' }>;
type MediaPayload = Extract<ChatPayload, { k: 'm' }>;

const MAX_VIDEO_MB = 9;
const MAX_ATTACH_PER_PICK = 5;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const mediaCache = new Map<string, string>();
const rememberMedia = (url: string, blob: Blob) => { mediaCache.set(url, URL.createObjectURL(blob)); };

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
      const arrayBuffer = await res.arrayBuffer();
      const blob = await decryptBlob(arrayBuffer, p.key, p.iv, p.mime);
      const fixedBlob = new Blob([blob], { type: p.mime });
      const objectUrl = URL.createObjectURL(fixedBlob);
      mediaCache.set(p.url, objectUrl); setSrc(objectUrl);
    } catch (e) { console.error(e); setFailed(true); } finally { setLoading(false); }
  }, [p.url, p.key, p.iv, p.mime]);
  useEffect(() => { if (auto && !src) load(); }, [auto, src, load]);
  return { src, loading, failed, load };
};

const ReactionBar: React.FC<{ onSelect: (emoji: string) => void; onReply: () => void; onForward: () => void }> = ({ onSelect, onReply, onForward }) => {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  return (
    <div className="absolute -top-12 right-0 bg-dark-800 border border-white/10 rounded-full shadow-lg flex items-center p-1 gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {emojis.map(e => (<button key={e} onClick={() => onSelect(e)} className="p-2 hover:bg-white/10 rounded-full text-lg transition">{e}</button>))}
      <button onClick={onReply} className="p-2 hover:bg-white/10 rounded-full text-slate-300"><CornerUpLeft className="w-4 h-4" /></button>
      <button onClick={onForward} className="p-2 hover:bg-white/10 rounded-full text-slate-300"><Share2 className="w-4 h-4" /></button>
    </div>
  );
};

const VoiceBubble: React.FC<{ payload: VoicePayload }> = ({ payload }) => {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => { return () => { if (src) URL.revokeObjectURL(src); }; }, [src]);
  useEffect(() => { if (src) audioRef.current?.play().catch(() => {}); }, [src]);
  const toggle = async () => {
    if (!src) {
      setLoading(true); setFailed(false);
      try {
        const res = await fetch(payload.url);
        if (!res.ok) throw new Error('fetch');
        const blob = await decryptBlob(await res.arrayBuffer(), payload.key, payload.iv, payload.mime);
        setSrc(URL.createObjectURL(blob));
      } catch (e) { console.error(e); setFailed(true); } finally { setLoading(false); }
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };
  return (
    <div className="flex items-center gap-3 min-w-[170px]">
      <button onClick={toggle} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 active:scale-90 transition">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1 h-1.5 rounded-full bg-white/20" />
      <span className="text-[11px] opacity-80 tabular-nums">{failed ? t('chat.voiceError') : fmt(payload.dur)}</span>
      {src && <audio ref={audioRef} src={src} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="hidden" />}
    </div>
  );
};

const MediaBubble: React.FC<{ payload: MediaPayload; onOpenImage: (src: string) => void }> = ({ payload, onOpenImage }) => {
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
    return <video src={src} controls autoPlay playsInline className="w-56 max-h-72 rounded-xl bg-black" />;
  }
  const ratio = Math.min(1.8, Math.max(0.6, payload.w && payload.h ? payload.w / payload.h : 4 / 3));
  return (
    <div className="relative w-56 rounded-xl overflow-hidden bg-black/30" style={{ aspectRatio: String(ratio) }}>
      {src ? (<img src={src} alt="" draggable={false} onClick={() => onOpenImage(src)} className="w-full h-full object-cover cursor-pointer" />) : 
       failed ? (<button onClick={load} className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs opacity-80"><RefreshCw className="w-5 h-5" /> {t('chat.mediaError')}</button>) : 
       (<div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin opacity-70" /></div>)}
    </div>
  );
};

const ForwardModal: React.FC<{ me: string; onClose: () => void; onForward: (otherUid: string) => void }> = ({ me, onClose, onForward }) => {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const briefs = useUserBriefs(convs.filter(c => c.type !== 'group').map(c => c.otherUid));
  useEffect(() => { const unsub = subscribeConversations(me, setConvs); return () => unsub(); }, [me]);
  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-900 w-full max-w-sm rounded-2xl overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-white font-bold">إعادة التوجيه إلى...</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {convs.map(c => {
            const isGroup = c.type === 'group';
            const b = !isGroup ? briefs[c.otherUid] : null;
            return (
              <button key={c.id} onClick={() => onForward(isGroup ? c.id : c.otherUid)} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition">
                {isGroup ? <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center"><Users className="w-5 h-5 text-slate-400"/></div> : <Avatar src={b?.photoURL} seed={c.otherUid} name={b?.displayName} className="w-10 h-10 rounded-full" />}
                <span className="text-sm font-bold text-white">{isGroup ? c.name : b?.displayName || '...'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ChatBody: React.FC<{ me: string; other: string }> = ({ me, other }) => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  
  const [isGroup, setIsGroup] = useState<boolean | undefined>(undefined);
  const [groupInfo, setGroupInfo] = useState<Conversation | null>(null);
  const [theme, setTheme] = useState<string>('default');
  
  const briefs = useUserBriefs(isGroup === false ? [other] : []);
  const b = briefs[other];

  const [local, setLocal] = useState<LocalKey | null>(null);
  const [theirs, setTheirs] = useState<PublicKeyInfo | null | undefined>(undefined);
  const [exists, setExists] = useState<boolean | undefined>(undefined);
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [plain, setPlain] = useState<Record<string, ChatPayload | null>>({});
  const plainRef = useRef(plain); plainRef.current = plain;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<string | null>(null);
  const [activeMsg, setActiveMsg] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<RawMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<RawMessage | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<number | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const convSnap = await getDocs(query(collection(db, 'conversations'), where('members', 'array-contains', me), limit(50)));
      const found = convSnap.docs.find(d => d.id === other);
      
      if (found) {
        const data = found.data();
        if (data.theme) setTheme(data.theme);
        if (data.type === 'group') {
          setIsGroup(true);
          setGroupInfo({ id: found.id, ...data } as Conversation);
        } else {
          setIsGroup(false);
        }
      } else {
        setIsGroup(false);
      }
    })().catch(e => { console.error(e); if (!off) setIsGroup(false); });
    return () => { off = true; };
  }, [me, other]);

  useEffect(() => {
    if (isGroup !== false) return;
    let off = false;
    (async () => {
      const [l, k, ex] = await Promise.all([getLocalKey(me), getPublicKeyInfo(other), conversationExists(me, convIdOf(me, other))]);
      if (off) return;
      setLocal(l); setTheirs(k); setExists(ex);
    })().catch((e) => { console.error(e); if (!off) { setTheirs(null); setExists(false); } });
    return () => { off = true; };
  }, [isGroup, me, other]);

  useEffect(() => {
    if (isGroup === undefined) return;
    const convId = isGroup ? other : convIdOf(me, other);
    return subscribeMessages(convId, setMessages, (e) => console.error('messages error:', e));
  }, [isGroup, me, other]);

  useEffect(() => {
    if (isGroup || !local || theirs === undefined) return;
    let off = false;
    (async () => {
      const next: Record<string, ChatPayload | null> = {};
      for (const m of messages) { if (m.id in plainRef.current) continue; next[m.id] = await decryptMessage(me, local, theirs, m); }
      if (!off && Object.keys(next).length) setPlain((p) => ({ ...p, ...next }));
    })();
    return () => { off = true; };
  }, [isGroup, messages, local, theirs, me]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const doSend = async (payload: ChatPayload, targetUid: string = other): Promise<boolean> => {
    setBusy(true); setError('');
    try {
      const convId = isGroup ? other : convIdOf(me, targetUid);
      if (isGroup && payload.k !== 't') throw new Error('الملفات غير مدعومة في المجموعات حالياً.');
      
      await sendPayload(me, convId, payload, exists === true, replyTo?.id);
      if (!exists && targetUid === other && !isGroup) setExists(true);
      if (!theirs && targetUid === other && !isGroup) getPublicKeyInfo(other).then(setTheirs).catch(console.error);
      setReplyTo(null);
      return true;
    } catch (e: any) {
      console.error(e);
      setError(e?.message || t('chat.sendFailed'));
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
      setBusy(false);
      await doSend({ k: 'v', url, key: enc.key, iv: enc.iv, dur: r.duration, mime: r.mime });
    } catch (e: any) { console.error(e); setError(`${t('chat.sendFailed')} (${e?.message || e?.name || ''})`.trim()); setBusy(false); }
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
    } catch (e) { console.error(e); setError(t('chat.sendFailed')); setBusy(false); return false; }
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_ATTACH_PER_PICK);
    e.target.value = '';
    if (!files.length || busy) return;
    for (const f of files) { const ok = await sendOneMedia(f); if (!ok) break; }
    setProgress(null);
  };

  const { recording, seconds, start, stop, cancel } = useVoiceRecorder(sendVoice);
  const startRec = async () => {
    setError('');
    try { await start(); } catch (e: any) { console.error(e); setError(e?.name === 'NotFoundError' || !navigator.mediaDevices ? t('chat.micMissing') : `${t('chat.micDenied')} ${t('chat.micSettingsHint')}`); }
  };

  const name = isGroup ? (groupInfo?.name || 'مجموعة') : (b?.displayName || '...');
  const avatarSrc = isGroup ? groupInfo?.photoURL : b?.photoURL;
  const avatarSeed = isGroup ? other : other;

  return (
    <>
      <div 
        className={`fixed inset-x-0 z-30 mx-auto max-w-2xl flex flex-col ${theme === 'dark' ? 'bg-black' : theme === 'romantic' ? 'bg-pink-950' : theme === 'friends' ? 'bg-blue-950' : 'bg-dark-950'}`} 
        style={{ top: 'var(--app-header-h, calc(env(safe-area-inset-top) + 3.75rem))', bottom: 0 }}
      >
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 shrink-0">
          <button onClick={() => navigate('/messages')} className="p-2 rounded-xl hover:bg-white/10 text-slate-300"><ArrowRight className="w-5 h-5" /></button>
          <button onClick={() => !isGroup && navigate(`/user/${other}`)} className="flex items-center gap-3 min-w-0">
            {isGroup ? (
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-white/10"><Users className="w-5 h-5 text-slate-400" /></div>
            ) : (
              <Avatar src={avatarSrc} seed={avatarSeed} name={name} className="w-10 h-10 rounded-full object-cover bg-dark-900" />
            )}
            <div className="min-w-0 text-start">
              <p className="text-sm font-black text-white truncate">{name}</p>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1"><Lock className="w-3 h-3" /> {t('chat.encrypted')}</p>
            </div>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-2">
          {messages.map((m) => {
            const mine = m.senderId === me;
            const p = plain[m.id];
            const isMedia = !!p && p.k === 'm';
            const time = m.createdAt?.toDate?.() ? m.createdAt.toDate().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) : '';
            const repliedMsg = m.replyTo ? messages.find(x => x.id === m.replyTo) : null;
            const repliedP = repliedMsg ? plain[repliedMsg.id] : null;
            const senderBrief = !mine && isGroup ? briefs[m.senderId] : null;

            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'} relative`}>
                {!mine && isGroup && (<span className="text-[10px] text-slate-400 mb-1 px-1">{senderBrief?.displayName || 'عضو'}</span>)}
                <div className="relative max-w-[80%]">
                  {activeMsg === m.id && (
                    <ReactionBar 
                      onSelect={(emoji) => { setActiveMsg(null); sendReaction(isGroup ? other : convIdOf(me, other), m.id, emoji, me); }}
                      onReply={() => { setReplyTo(m); setActiveMsg(null); }}
                      onForward={() => { setForwardMsg(m); setActiveMsg(null); }}
                    />
                  )}
                  <div 
                    onPointerDown={() => { pressTimer.current = window.setTimeout(() => setActiveMsg(m.id), 500); }} 
                    onPointerUp={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }} 
                    onPointerLeave={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
                    className={`rounded-2xl text-sm break-words ${isMedia ? 'p-1.5' : 'px-3 py-2'} ${mine ? 'bg-gradient-to-tr from-primary-500 to-accent-500 text-white' : 'bg-white/10 text-white'}`}
                  >
                    {repliedMsg && (
                      <div className="text-[11px] bg-black/20 p-2 rounded-lg mb-2 border-l-2 border-white/50">
                        <p className="font-bold opacity-80 mb-1">{repliedMsg.senderId === me ? 'أنت' : 'عضو'}</p>
                        {/* إصلاح الخطأ: التحقق من أن repliedP ليس null قبل قراءة v */}
                        <p className="opacity-70 truncate">
                          {repliedP && repliedP.k === 't' ? repliedP.v : '📷 وسائط'}
                        </p>
                      </div>
                    )}
                    {p === undefined ? (<Loader2 className="w-4 h-4 animate-spin" />) : p === null ? (<span className="text-xs opacity-70">غير قابل للقراءة</span>) : p.k === 't' ? (<p className="whitespace-pre-wrap">{p.v}</p>) : p.k === 'm' ? (<MediaBubble payload={p} onOpenImage={setViewer} />) : p.k === 'v' ? (<VoiceBubble payload={p} />) : null}
                    <div className={`flex items-center justify-between gap-3 mt-1 ${isMedia ? 'px-1.5 pb-0.5' : ''}`}>
                      <span className="text-[10px] opacity-60">{time}</span>
                      {mine && (<button onClick={async () => { if (await confirm({ title: 'حذف الرسالة؟' })) removeMessage(isGroup ? other : convIdOf(me, other), m.id); }} className="opacity-60 hover:opacity-100"><Trash2 className="w-3 h-3" /></button>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 border-t border-white/10 bg-dark-950/90 px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm">
          {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg mb-2">{error}</p>}
          {replyTo && (
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg mb-2 border-l-2 border-primary-500">
              <div className="min-w-0">
                <p className="text-[10px] text-primary-400 font-bold mb-0.5">الرد على</p>
                {/* إصلاح الخطأ: التحقق من النوع بشكل صريح */}
                <p className="text-xs text-slate-300 truncate">
                   {plain[replyTo.id] && plain[replyTo.id]?.k === 't' ? (plain[replyTo.id] as {k: 't', v: string}).v : '📷 وسائط'}
                </p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          )}
          {progress !== null && (
            <div className="mb-2"><div className="flex items-center justify-between text-[11px] text-slate-400 mb-1"><span>{t('chat.uploading')}</span><span className="tabular-nums">{progress}%</span></div><div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all" style={{ width: `${progress}%` }} /></div></div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickFiles} />
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendText()} maxLength={1500} placeholder={t('chat.placeholder')} className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm outline-none focus:border-primary-500" />
            {!isGroup && <button onClick={() => fileRef.current?.click()} disabled={busy} className="p-3 rounded-full bg-white/5 border border-white/10 text-slate-300 active:scale-90 transition disabled:opacity-50"><Paperclip className="w-4 h-4" /></button>}
            {text.trim() ? (<button onClick={sendText} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>) : 
             (!isGroup && <button onClick={startRec} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}</button>)}
          </div>
        </div>
      </div>
      {viewer && (<div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center" onClick={() => setViewer(null)}><button onClick={() => setViewer(null)} className="absolute end-4 p-2.5 rounded-full bg-white/10 text-white" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}><X className="w-5 h-5" /></button><img src={viewer} alt="" draggable={false} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain" /></div>)}
      {forwardMsg && (<ForwardModal me={me} onClose={() => setForwardMsg(null)} onForward={async (targetUid) => { setForwardMsg(null); const p = plain[forwardMsg.id]; if (p) await doSend(p, targetUid); }} />)}
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
