import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Trash2, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { deleteStory, markStorySeen, storyMillis } from '../services/storyService';
import type { StoryGroup } from '../services/storyService';
import { timeAgo } from '../utils/timeAgo';

interface Props {
  groups: StoryGroup[];
  startGroup: number;
  onClose: () => void;
}

const IMAGE_MS = 5000;

const StoryViewer: React.FC<Props> = ({ groups, startGroup, onClose }) => {
  const { user, isAdmin } = useAuth();
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const group = groups[gi];
  const story = group?.stories[si];

  const pausedRef = useRef(false);
  pausedRef.current = held || !loaded;

  const goNext = useCallback(() => {
    if (!group) return;
    if (si < group.stories.length - 1) {
      setSi(si + 1);
    } else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
    } else {
      onClose();
    }
  }, [group, si, gi, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) {
      setSi(si - 1);
    } else if (gi > 0) {
      const prev = groups[gi - 1];
      setGi(gi - 1);
      setSi(prev.stories.length - 1);
    } else {
      setProgress(0);
      if (videoRef.current) videoRef.current.currentTime = 0;
    }
  }, [si, gi, groups]);

  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  useEffect(() => {
    if (!story) return;
    setLoaded(false);
    setProgress(0);
    markStorySeen(story.authorId, storyMillis(story));
  }, [story?.id]);

  useEffect(() => {
    if (!story || story.mediaType === 'video') return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current) elapsed += dt;
      const p = Math.min(1, elapsed / IMAGE_MS);
      setProgress(p);
      if (p >= 1) {
        goNextRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (held) v.pause();
    else v.play().catch(() => undefined);
  }, [held, story?.id]);

  const touch = useRef({ x: 0, y: 0, t: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setHeld(true);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setHeld(false);
    const dx = e.clientX - touch.current.x;
    const dy = e.clientY - touch.current.y;
    const dt = Date.now() - touch.current.t;
    if (dy > 110 && Math.abs(dx) < 80) {
      onClose();
      return;
    }
    if (dt < 250 && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const w = window.innerWidth;
      if (e.clientX < w * 0.4) goNext();
      else if (e.clientX > w * 0.6) goPrev();
      else goNext();
    }
  };

  const onDelete = async () => {
    if (!story || !confirm('حذف هذه القصة؟')) return;
    try {
      await deleteStory(story.id);
      onClose();
    } catch (e: any) {
      alert('تعذّر الحذف: ' + (e?.message || ''));
    }
  };

  if (!group || !story) return null;
  const canDelete = story.authorId === user?.uid || isAdmin;
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none touch-none">
      <div
        className="absolute inset-0 flex items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setHeld(false)}
      >
        {story.mediaType === 'video' ? (
          <video
            key={story.id}
            ref={videoRef}
            src={story.mediaUrl}
            autoPlay
            playsInline
            muted={muted}
            className="w-full h-full object-contain"
            onLoadedData={() => setLoaded(true)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            onEnded={goNext}
            onError={goNext}
          />
        ) : (
          <img
            key={story.id}
            src={story.mediaUrl}
            alt=""
            draggable={false}
            className="w-full h-full object-contain"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
        )}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-white/70" />
          </div>
        )}
      </div>

      <div className="absolute top-0 inset-x-0 pointer-events-none bg-gradient-to-b from-black/70 via-black/30 to-transparent pb-10 pt-[calc(env(safe-area-inset-top)+10px)] px-3">
        <div className="flex gap-1">
          {group.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{ width: i < si ? '100%' : i === si ? `${Math.round(progress * 100)}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-3 pointer-events-auto">
          <img
            src={group.authorPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${group.authorId}`}
            alt=""
            className="w-9 h-9 rounded-full object-cover ring-2 ring-white/60 bg-dark-900"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{group.authorName}</p>
            <p className="text-[10px] text-white/70">{timeAgo(story.createdAt)}</p>
          </div>
          {story.mediaType === 'video' && (
            <button onPointerDown={stop} onPointerUp={stop} onClick={() => setMuted((m) => !m)} className="p-2 text-white" aria-label="الصوت">
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          )}
          {canDelete && (
            <button onPointerDown={stop} onPointerUp={stop} onClick={onDelete} className="p-2 text-white" aria-label="حذف">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button onPointerDown={stop} onPointerUp={stop} onClick={onClose} className="p-2 text-white" aria-label="إغلاق">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {story.caption && (
        <div className="absolute bottom-0 inset-x-0 pointer-events-none bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-[calc(env(safe-area-inset-bottom)+24px)] px-5">
          <p className="text-white text-sm font-semibold leading-relaxed text-center break-words">{story.caption}</p>
        </div>
      )}
    </div>
  );
};

export default StoryViewer;
