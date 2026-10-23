import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Heart, MessageCircle, Share2, Play, Volume2, VolumeX } from 'lucide-react';
import Avatar from './Avatar';

/* ───────────── YouTube IFrame API loader (مرة واحدة فقط) ───────────── */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytPromise: Promise<any> | null = null;
const loadYT = (): Promise<any> => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
  return ytPromise;
};

/* ───────────── Types ───────────── */
export interface VideoOverlayHandle {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
}

interface Props {
  videoId: string; // YouTube video ID
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  active?: boolean; // للاستخدام داخل فيد عمودي: false = إيقاف تلقائي
  author: { id: string; name: string; avatar?: string | null };
  caption?: string;
  likes: number;
  comments: number;
  liked?: boolean;
  onLike?: (next: boolean) => void;
  onComment?: () => void;
  onShare?: () => void;
  onProfile?: (authorId: string) => void;
  onStateChange?: (state: 'playing' | 'paused' | 'ended' | 'buffering') => void;
  className?: string;
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

/* ───────────── Component ───────────── */
const VideoOverlayPlayer = forwardRef<VideoOverlayHandle, Props>(function VideoOverlayPlayer(
  {
    videoId,
    autoPlay = true,
    loop = true,
    muted = true,
    active = true,
    author,
    caption,
    likes,
    comments,
    liked = false,
    onLike,
    onComment,
    onShare,
    onProfile,
    onStateChange,
    className = '',
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const tickRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [progress, setProgress] = useState(0);
  const [likeBurst, setLikeBurst] = useState(false);
  const lastTap = useRef(0);

  /* ── Base Layer: إنشاء المشغل بدون أي أزرار تحكم ── */
  useEffect(() => {
    let destroyed = false;
    const mount = document.createElement('div');
    hostRef.current?.appendChild(mount);

    loadYT().then((YT) => {
      if (destroyed) return;
      playerRef.current = new YT.Player(mount, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          showinfo: 0,
          cc_load_policy: 0,
          autoplay: autoPlay && active ? 1 : 0,
          mute: muted ? 1 : 0,
          loop: loop ? 1 : 0,
          playlist: loop ? videoId : undefined,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (destroyed) return;
            setReady(true);
            if (muted) playerRef.current.mute();
            if (autoPlay && active) playerRef.current.playVideo();
          },
          onStateChange: (e: any) => {
            const S = YT.PlayerState;
            if (e.data === S.PLAYING) {
              setPlaying(true);
              onStateChange?.('playing');
            } else if (e.data === S.PAUSED) {
              setPlaying(false);
              onStateChange?.('paused');
            } else if (e.data === S.BUFFERING) {
              onStateChange?.('buffering');
            } else if (e.data === S.ENDED) {
              setPlaying(false);
              onStateChange?.('ended');
              if (loop) playerRef.current?.playVideo();
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
      playerRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  /* ── Bridge: إيقاف/تشغيل تلقائي حسب ظهور الفيديو في الفيد ── */
  useEffect(() => {
    if (!ready) return;
    if (active) playerRef.current?.playVideo();
    else playerRef.current?.pauseVideo();
  }, [active, ready]);

  /* ── Progress bar ── */
  useEffect(() => {
    if (!ready || !playing) return;
    const loopTick = () => {
      const p = playerRef.current;
      const d = p?.getDuration?.() || 0;
      if (d > 0) setProgress((p.getCurrentTime() / d) * 100);
      tickRef.current = requestAnimationFrame(loopTick);
    };
    tickRef.current = requestAnimationFrame(loopTick);
    return () => {
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
    };
  }, [ready, playing]);

  /* ── Bridge API ── */
  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);
  const seek = useCallback((s: number) => playerRef.current?.seekTo(s, true), []);

  useImperativeHandle(ref, () => ({ play, pause, toggle, seek }), [play, pause, toggle, seek]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const p = playerRef.current;
    if (!p) return;
    if (isMuted) {
      p.unMute();
      p.setVolume(100);
    } else {
      p.mute();
    }
    setIsMuted(!isMuted);
  };

  /* ── Tap = play/pause | Double tap = like ── */
  const onSurfaceTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!liked) onLike?.(true);
      setLikeBurst(true);
      setTimeout(() => setLikeBurst(false), 700);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setTimeout(() => {
      if (lastTap.current === now) toggle();
    }, 300);
  };

  const seekFromBar = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const d = playerRef.current?.getDuration?.() || 0;
    if (d) {
      seek(d * ratio);
      setProgress(ratio * 100);
    }
  };

  return (
    <div className={`relative w-full h-full bg-black overflow-hidden select-none ${className}`}>
      {/* ═════ Base Layer ═════ 
          iframe مكبّر قليلاً ومقصوص لإخفاء أي شريط/شعار على الحواف، وبدون استقبال لمس */}
      <div
        ref={hostRef}
        className="absolute inset-0 pointer-events-none [&_iframe]:absolute [&_iframe]:top-1/2 [&_iframe]:left-1/2 [&_iframe]:w-[177.78vh] [&_iframe]:min-w-full [&_iframe]:h-[120%] [&_iframe]:min-h-[56.25vw] [&_iframe]:-translate-x-1/2 [&_iframe]:-translate-y-1/2 [&_iframe]:border-0"
      />

      {/* ═════ Touch Surface (يحجب كل تفاعل مع الـ iframe) ═════ */}
      <div className="absolute inset-0 z-10" onClick={onSurfaceTap} />

      {/* ═════ Overlay UI ═════ */}
      {!playing && ready && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-10 h-10 text-white fill-white ms-1" />
          </div>
        </div>
      )}

      {likeBurst && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <Heart className="w-28 h-28 text-red-500 fill-red-500 animate-ping" />
        </div>
      )}

      {/* أزرار الجانب */}
      <div className="absolute z-30 end-3 bottom-24 flex flex-col items-center gap-5 text-white">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLike?.(!liked);
          }}
          className="flex flex-col items-center gap-1 active:scale-90 transition"
          aria-label="like"
        >
          <Heart className={`w-8 h-8 drop-shadow ${liked ? 'text-red-500 fill-red-500' : ''}`} />
          <span className="text-xs font-semibold drop-shadow">{fmt(likes)}</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onComment?.();
          }}
          className="flex flex-col items-center gap-1 active:scale-90 transition"
          aria-label="comments"
        >
          <MessageCircle className="w-8 h-8 drop-shadow" />
          <span className="text-xs font-semibold drop-shadow">{fmt(comments)}</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onShare?.();
          }}
          className="flex flex-col items-center gap-1 active:scale-90 transition"
          aria-label="share"
        >
          <Share2 className="w-8 h-8 drop-shadow" />
        </button>

        <button onClick={toggleMute} className="active:scale-90 transition" aria-label="mute">
          {isMuted ? <VolumeX className="w-7 h-7 drop-shadow" /> : <Volume2 className="w-7 h-7 drop-shadow" />}
        </button>
      </div>

      {/* معلومات البروفايل */}
      <div className="absolute z-30 start-3 end-20 bottom-8 text-white">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onProfile?.(author.id);
          }}
          className="flex items-center gap-2 mb-2"
        >
          <Avatar src={author.avatar} seed={author.id} name={author.name} className="w-10 h-10 rounded-full object-cover border border-white/60" />
          <span className="font-bold text-sm drop-shadow">{author.name}</span>
        </button>
        {caption && <p className="text-sm leading-snug line-clamp-2 drop-shadow">{caption}</p>}
      </div>

      {/* شريط التقدم */}
      <div className="absolute z-30 inset-x-0 bottom-0 h-4 flex items-end cursor-pointer" onClick={seekFromBar}>
        <div className="w-full h-[3px] bg-white/25">
          <div className="h-full bg-white" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* تدرج سفلي لوضوح النصوص */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-[15]" />
    </div>
  );
});

export default VideoOverlayPlayer;

/* ───────────── مثال الاستخدام ─────────────
<div className="h-[100dvh] w-full">
  <VideoOverlayPlayer
    videoId="dQw4w9WgXcQ"
    active={isVisible}
    author={{ id: user.id, name: user.name, avatar: user.photoURL }}
    caption="وصف الفيديو"
    likes={1200}
    comments={45}
    liked={liked}
    onLike={setLiked}
    onComment={() => setCommentsOpen(true)}
    onShare={() => setShareOpen(true)}
    onProfile={(id) => navigate(`/profile/${id}`)}
  />
</div>
*/
