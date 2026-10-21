import { useEffect, useState } from 'react';

/**
 * مدير الوسائط المركزي (مصدر صوت واحد فقط في كل التطبيق).
 *
 * 1) lockMedia / useMediaLock: عند فتح ستوري أو تعليقات أو أي نافذة منبثقة
 *    يتم إيقاف كل الفيديوهات الأخرى فوراً، ويُمنع أي فيديو من التشغيل حتى تُغلق النافذة.
 * 2) registerFeedPlayer / reportFeedRatio: في الفيد، فيديو واحد فقط (الأقرب لمنتصف الشاشة) يعمل.
 * 3) مستمع عام لحدث play: أي فيديو/صوت يبدأ يوقف كل البقية (حزام أمان نهائي).
 * 4) عند إخفاء التطبيق/التبويب تتوقف كل الفيديوهات.
 *
 * العنصر الذي يحمل الخاصية data-media-priority (فيديو الستوري) مسموح له بالعمل أثناء القفل.
 */

export const MEDIA_PRIORITY_ATTR = 'data-media-priority';

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((f) => f());

let locks = 0;

const hidden = () => typeof document !== 'undefined' && document.hidden;

/** هل التشغيل ممنوع الآن؟ (نافذة مفتوحة أو التطبيق في الخلفية) */
export const isMediaBlocked = () => locks > 0 || hidden();

const allMedia = (): HTMLMediaElement[] =>
  typeof document === 'undefined'
    ? []
    : Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'));

/* ------------------------- فيديوهات الفيد ------------------------- */

interface FeedPlayer {
  box: () => HTMLElement | null;
  ratio: number;
  play: () => void;
  pause: () => void;
}

const feed = new Map<string, FeedPlayer>();
let activeFeedId: string | null = null;
const MIN_PLAY_RATIO = 0.6;

const elect = () => {
  let best: string | null = null;
  if (!isMediaBlocked()) {
    const center = window.innerHeight / 2;
    let bestDist = Infinity;
    feed.forEach((p, id) => {
      if (p.ratio < MIN_PLAY_RATIO) return;
      const el = p.box();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - center);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    });
  }
  activeFeedId = best;
  feed.forEach((p, id) => {
    if (id === best) p.play();
    else p.pause();
  });
};

/** تسجيل فيديو من الفيد. يرجع دالة إلغاء التسجيل (تُستدعى عند الـ Unmount). */
export const registerFeedPlayer = (id: string, p: Omit<FeedPlayer, 'ratio'>) => {
  feed.set(id, { ...p, ratio: 0 });
  return () => {
    feed.delete(id);
    p.pause();
    if (activeFeedId === id) {
      activeFeedId = null;
      elect();
    }
  };
};

/** تبليغ نسبة ظهور الفيديو (من IntersectionObserver) وإعادة اختيار الفيديو الفعّال */
export const reportFeedRatio = (id: string, ratio: number) => {
  const p = feed.get(id);
  if (!p) return;
  p.ratio = ratio;
  elect();
};

export const isFeedActive = (id: string) => activeFeedId === id && !isMediaBlocked();

/* ------------------------- قفل الوسائط (نوافذ/ستوري) ------------------------- */

/** يوقف كل الفيديوهات فوراً ويمنع تشغيلها حتى استدعاء دالة الإلغاء المرجعة */
export const lockMedia = (): (() => void) => {
  locks += 1;
  feed.forEach((p) => p.pause());
  allMedia().forEach((m) => {
    if (!m.hasAttribute(MEDIA_PRIORITY_ATTR)) m.pause();
  });
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    notify();
    elect();
  };
};

/** Hook: يقفل الوسائط طوال فترة كون المكوّن مفتوحاً (أو طالما active = true) */
export const useMediaLock = (active: boolean = true) => {
  useEffect(() => {
    if (!active) return;
    return lockMedia();
  }, [active]);
};

/** Hook: هل التشغيل ممنوع حالياً؟ (للمكوّنات التي تدير تشغيلها بنفسها مثل الريلز) */
export const useMediaBlocked = () => {
  const [blocked, setBlocked] = useState(isMediaBlocked());
  useEffect(() => {
    const fn = () => setBlocked(isMediaBlocked());
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return blocked;
};

/* ------------------------- حزام الأمان العام ------------------------- */

if (typeof document !== 'undefined') {
  // أي عنصر وسائط يبدأ التشغيل: نوقف كل الباقي، وإن كان القفل فعّالاً نوقفه هو نفسه
  document.addEventListener(
    'play',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLMediaElement)) return;
      const priority = t.hasAttribute(MEDIA_PRIORITY_ATTR);
      if (isMediaBlocked() && !priority) {
        t.pause();
        return;
      }
      allMedia().forEach((m) => {
        if (m !== t && !m.paused) m.pause();
      });
    },
    true
  );

  // عند إخفاء التطبيق/التبويب: إيقاف كل الفيديوهات؛ عند الرجوع: إعادة اختيار الفعّال
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      feed.forEach((p) => p.pause());
      allMedia().forEach((m) => {
        if (!m.hasAttribute(MEDIA_PRIORITY_ATTR)) m.pause();
      });
    }
    notify();
    if (!document.hidden) elect();
  });
}
