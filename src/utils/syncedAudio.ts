import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * يشغّل "الصوت المستعار" (ريمكس) متزامناً مع عنصر الفيديو.
 *
 * - الصوت يعمل ويتوقف مع الفيديو تماماً (play / pause / seek / loop).
 * - عنصر الصوت غير مرتبط بالصفحة (DOM)، لذلك لا يتعارض مع مدير الوسائط:
 *   أي إيقاف للفيديو (نافذة منبثقة، ستوري، إخفاء التطبيق...) يوقف الصوت تلقائياً.
 * - يجب كتم الفيديو نفسه عند وجود صوت مستعار (صوت الفيديو الأصلي غير مطلوب).
 *
 * @param videoRef عنصر الفيديو
 * @param audioUrl رابط الصوت المستعار (إن لم يوجد لا يحدث شيء)
 * @param muted    هل المستخدم كاتم الصوت؟
 * @param ready    هل عنصر الفيديو موجود وجاهز في الصفحة؟
 */
export const useSyncedAudio = (
  videoRef: RefObject<HTMLVideoElement>,
  audioUrl: string | undefined,
  muted: boolean,
  ready: boolean
): void => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const v = videoRef.current;
    if (!audioUrl || !ready || !v) return;

    const a = new Audio();
    a.preload = 'auto';
    a.loop = true;
    a.muted = mutedRef.current;
    a.src = audioUrl;
    audioRef.current = a;

    const sync = () => {
      const d = a.duration;
      if (!d || !isFinite(d)) return;
      const target = v.currentTime % d;
      if (Math.abs(a.currentTime - target) > 0.5) {
        try {
          a.currentTime = target;
        } catch {
          // تجاهل: الصوت لم يجهز بعد
        }
      }
    };
    const onPlay = () => {
      sync();
      a.play().catch(() => undefined);
    };
    const onPause = () => a.pause();

    v.addEventListener('play', onPlay);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onPause);
    v.addEventListener('seeked', sync);
    v.addEventListener('timeupdate', sync);
    a.addEventListener('loadedmetadata', sync);

    if (!v.paused) onPlay();

    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onPause);
      v.removeEventListener('seeked', sync);
      v.removeEventListener('timeupdate', sync);
      a.removeEventListener('loadedmetadata', sync);
      a.pause();
      a.removeAttribute('src');
      a.load();
      audioRef.current = null;
    };
  }, [audioUrl, ready, videoRef]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted, audioUrl, ready]);
};
