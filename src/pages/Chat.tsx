import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Send, Mic, Trash2, Lock, Loader2, Play, Pause, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import E2EEGate from '../components/E2EEGate';
import { useUserBriefs } from '../services/userCache';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type { VoiceResult } from '../hooks/useVoiceRecorder';
import { decryptBlob, encryptBlob, getLocalKey } from '../services/cryptoService';
import type { LocalKey } from '../services/cryptoService';
import { uploadEncryptedBlob } from '../services/cloudinaryService';
import {
  convIdOf, conversationExists, decryptMessage, getPublicKeyInfo, removeMessage, sendPayload, subscribeMessages,
} from '../services/chatService';
import type { ChatPayload, PublicKeyInfo, RawMessage } from '../services/chatService';

type VoicePayload = Extract<ChatPayload, { k: 'v' }>;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const VoiceBubble: React.FC<{ payload: VoicePayload }> = ({ payload }) => {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  useEffect(() => {
    if (src) audioRef.current?.play().catch(() => {});
  }, [src]);

  const toggle = async () => {
    if (!src) {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(payload.url);
        if (!res.ok) throw new Error('fetch');
        const blob = await decryptBlob(await res.arrayBuffer(), payload.key, payload.iv, payload.mime);
        setSrc(URL.createObjectURL(blob));
      } catch (e) {
        console.error(e);
        setFailed(true);
      } finally {
        setLoading(false);
      }
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  return (
    <div className="flex items-center gap-3 min-w-[170px]">
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 active:scale-90 transition"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </button>
      <div className="flex-1 h-1.5 rounded-full bg-white/20" />
      <span className="text-[11px] opacity-80 tabular-nums">{failed ? t('chat.voiceError') : fmt(payload.dur)}</span>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
};

const ChatBody: React.FC<{ me: string; other: string }> = ({ me, other }) => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const briefs = useUserBriefs([other]);
  const b = briefs[other];
  const convId = convIdOf(me, other);

  const [local, setLocal] = useState<LocalKey | null>(null);
  const [theirs, setTheirs] = useState<PublicKeyInfo | null | undefined>(undefined);
  const [exists, setExists] = useState<boolean | undefined>(undefined);
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [plain, setPlain] = useState<Record<string, ChatPayload | null>>({});
  const plainRef = useRef(plain);
  plainRef.current = plain;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const [l, k, ex] = await Promise.all([
        getLocalKey(me),
        getPublicKeyInfo(other),
        conversationExists(me, convId),
      ]);
      if (off) return;
      setLocal(l);
      setTheirs(k);
      setExists(ex);
    })().catch((e) => {
      console.error(e);
      if (!off) {
        setTheirs(null);
        setExists(false);
      }
    });
    return () => {
      off = true;
    };
  }, [me, other, convId]);

  useEffect(() => {
    if (!exists) return;
    return subscribeMessages(convId, setMessages, (e) => console.error('messages error:', e));
  }, [exists, convId]);

  useEffect(() => {
    if (!local || theirs === undefined) return;
    let off = false;
    (async () => {
      const next: Record<string, ChatPayload | null> = {};
      for (const m of messages) {
        if (m.id in plainRef.current) continue;
        next[m.id] = await decryptMessage(me, local, theirs, m);
      }
      if (!off && Object.keys(next).length) setPlain((p) => ({ ...p, ...next }));
    })();
    return () => {
      off = true;
    };
  }, [messages, local, theirs, me]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const doSend = async (payload: ChatPayload): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await sendPayload(me, other, payload, exists === true);
      if (!exists) setExists(true);
      if (!theirs) getPublicKeyInfo(other).then(setTheirs).catch(console.error);
      return true;
    } catch (e: any) {
      console.error(e);
      setError(e?.message === 'RECIPIENT_NO_KEY' ? t('chat.noKey') : t('chat.sendFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendText = async () => {
    const v = text.trim();
    if (!v || busy) return;
    if (await doSend({ k: 't', v: v.slice(0, 1500) })) setText('');
  };

  const sendVoice = async (r: VoiceResult | null) => {
    if (!r) return;
    setBusy(true);
    setError('');
    try {
      const enc = await encryptBlob(r.blob);
      const url = await uploadEncryptedBlob(enc.data);
      setBusy(false);
      await doSend({ k: 'v', url, key: enc.key, iv: enc.iv, dur: r.duration, mime: r.mime });
    } catch (e) {
      console.error(e);
      setError(t('chat.sendFailed'));
      setBusy(false);
    }
  };

  const { recording, seconds, start, stop, cancel } = useVoiceRecorder(sendVoice);

  const startRec = async () => {
    setError('');
    try {
      await start();
    } catch (e) {
      console.error(e);
      setError(t('chat.micDenied'));
    }
  };

  const remove = async (m: RawMessage) => {
    if (!confirm(t('chat.deleteConfirm'))) return;
    try {
      await removeMessage(convId, m.id);
    } catch (e) {
      console.error(e);
    }
  };

  const name = b?.displayName || '...';

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <button onClick={() => navigate('/messages')} className="p-2 rounded-xl hover:bg-white/10 text-slate-300" aria-label={t('common.back')}>
          <ArrowRight className="w-5 h-5" />
        </button>
        <button onClick={() => navigate(`/user/${other}`)} className="flex items-center gap-3 min-w-0">
          <Avatar src={b?.photoURL} seed={other} name={name} className="w-10 h-10 rounded-full object-cover bg-dark-900" />
          <div className="min-w-0 text-start">
            <p className="text-sm font-black text-white truncate">{name}</p>
            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> {t('chat.encrypted')}
            </p>
          </div>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-2">
        {exists === undefined && (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === me;
          const p = plain[m.id];
          const time = m.createdAt?.toDate?.()
            ? m.createdAt.toDate().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
            : '';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm break-words ${
                  mine ? 'bg-gradient-to-tr from-primary-500 to-accent-500 text-white' : 'bg-white/10 text-white'
                }`}
              >
                {p === undefined ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : p === null ? (
                  <span className="text-xs opacity-70">{t('chat.undecryptable')}</span>
                ) : p.k === 't' ? (
                  <p className="whitespace-pre-wrap">{p.v}</p>
                ) : (
                  <VoiceBubble payload={p} />
                )}
                <div className="flex items-center justify-between gap-3 mt-1">
                  <span className="text-[10px] opacity-60">{time}</span>
                  {mine && (
                    <button onClick={() => remove(m)} className="opacity-60 hover:opacity-100" aria-label={t('common.delete')}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg mb-2">{error}</p>}

      {recording ? (
        <div className="flex items-center gap-3 p-2 rounded-2xl bg-red-500/10 border border-red-500/30">
          <button onClick={cancel} className="p-2 text-slate-300" aria-label={t('common.cancel')}>
            <X className="w-5 h-5" />
          </button>
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="flex-1 text-sm text-white tabular-nums">
            {t('chat.recording')} {fmt(seconds)}
          </span>
          <button
            onClick={async () => sendVoice(await stop())}
            className="btn-primary p-3 rounded-full"
            aria-label={t('common.send')}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendText()}
            maxLength={1500}
            placeholder={t('chat.placeholder')}
            className="flex-1 px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
          />
          {text.trim() ? (
            <button onClick={sendText} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50" aria-label={t('common.send')}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          ) : (
            <button onClick={startRec} disabled={busy} className="btn-primary p-3 rounded-full disabled:opacity-50" aria-label="mic">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}
    </div>
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
