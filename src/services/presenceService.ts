import { useEffect, useState } from 'react';
import { collection, doc, documentId, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';

// المستخدم يُعتبر "متصلاً" إذا كان نشاطه خلال آخر دقيقتين ونصف
export const ONLINE_WINDOW_MS = 150 * 1000;
export const HEARTBEAT_MS = 60 * 1000;
// أقصى مدة نعرض بعدها نص "نشط منذ ..." (بعدها لا نعرض شيئاً)
export const LAST_SEEN_MAX_MS = 30 * 24 * 60 * 60 * 1000;

// مؤشر الاتصال: دائرة بلون التطبيق الوردي الأساسي (primary-500) مع توهّج خفيف.
// الحدود بلون خلفية الصفحة حتى يبدو المؤشر منفصلاً عن الصورة في المظهرين الداكن والفاتح.
export const PRESENCE_DOT_CLASS =
  'bg-primary-500 border-2 border-dark-950 rounded-full shadow-[0_0_8px_rgba(217,70,239,0.75)]';

// نبضة نشاط: تُرسل فقط إذا كان المستخدم يُظهر حالة نشاطه
export const sendHeartbeat = async (uid: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), { lastActive: serverTimestamp() });
  } catch (e) {
    console.error('heartbeat failed:', e);
  }
};

interface PresenceRec { lastActive: number; show: boolean; }

export interface PresenceInfo {
  /** متصل الآن (نشاط خلال آخر دقيقتين ونصف) */
  online: boolean;
  /** هل يحق لنا عرض حالته؟ (هو لم يُخفِ نشاطه + أنا لم أُخفِ نشاطي + لديه آخر ظهور مسجّل) */
  visible: boolean;
  /** وقت آخر نشاط بالمللي ثانية (0 = غير معروف) */
  lastActive: number;
}

const HIDDEN: PresenceInfo = { online: false, visible: false, lastActive: 0 };

const toInfo = (r: PresenceRec | undefined, iShowActivity: boolean): PresenceInfo => {
  if (!iShowActivity || !r || !r.show || r.lastActive <= 0) return HIDDEN;
  return {
    online: Date.now() - r.lastActive < ONLINE_WINDOW_MS,
    visible: true,
    lastActive: r.lastActive,
  };
};

// يعيد { uid: PresenceInfo } بشكل لحظي. إن أخفيتَ أنت حالتك فلن ترى حالة الآخرين أيضاً.
export const usePresenceInfo = (
  uids: Array<string | undefined>,
  iShowActivity: boolean = true
): Record<string, PresenceInfo> => {
  const key = Array.from(new Set(uids.filter((x): x is string => !!x))).sort().join(',');
  const [recs, setRecs] = useState<Record<string, PresenceRec>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    const unsubs: Array<() => void> = [];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const q = query(collection(db, 'users'), where(documentId(), 'in', chunk));
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            setRecs((prev) => {
              const next = { ...prev };
              snap.forEach((d) => {
                const x = d.data() as any;
                next[d.id] = {
                  lastActive: x.lastActive?.toMillis?.() ?? 0,
                  show: x.showActivity !== false,
                };
              });
              return next;
            });
          },
          (e) => console.error('presence error:', e)
        )
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [key]);

  // نعيد التقييم كل نصف دقيقة حتى يختفي المؤشر ويتحدّث نص "نشط منذ ..." عند الانقطاع
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const out: Record<string, PresenceInfo> = {};
  if (key) key.split(',').forEach((id) => { out[id] = toInfo(recs[id], iShowActivity); });
  return out;
};

// نسخة مبسّطة: { uid: true/false } لمن هو متصل الآن
export const usePresence = (uids: Array<string | undefined>, iShowActivity: boolean = true): Record<string, boolean> => {
  const info = usePresenceInfo(uids, iShowActivity);
  const out: Record<string, boolean> = {};
  Object.keys(info).forEach((id) => { out[id] = info[id].online; });
  return out;
};

// ---------------------------------------------------------------
// نص الحالة: "نشط الآن" / "نشط منذ 5 دقائق" / "نشط منذ ساعتين" ...
// ---------------------------------------------------------------
type PresenceLang = 'ar' | 'en' | 'fr' | 'es';

const pickLang = (lang: string): PresenceLang =>
  lang === 'ar' || lang === 'fr' || lang === 'es' ? lang : 'en';

// العربية: مفرد / مثنّى / جمع (3–10) / تمييز (11 فأكثر)
const arUnit = (n: number, one: string, two: string, few: string, many: string): string => {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
};

type Unit = 'minute' | 'hour' | 'day';

const agoText = (lang: PresenceLang, n: number, unit: Unit): string => {
  switch (lang) {
    case 'ar': {
      const u =
        unit === 'minute' ? arUnit(n, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')
        : unit === 'hour' ? arUnit(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')
        : arUnit(n, 'يوم', 'يومين', 'أيام', 'يومًا');
      return `نشط منذ ${u}`;
    }
    case 'fr': {
      const w = unit === 'minute' ? 'minute' : unit === 'hour' ? 'heure' : 'jour';
      return `Actif il y a ${n} ${w}${n === 1 ? '' : 's'}`;
    }
    case 'es': {
      const w = unit === 'minute' ? 'minuto' : unit === 'hour' ? 'hora' : 'día';
      return `Activo hace ${n} ${w}${n === 1 ? '' : 's'}`;
    }
    default: {
      return `Active ${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
  }
};

const NOW_TEXT: Record<PresenceLang, string> = {
  ar: 'نشط الآن',
  en: 'Active now',
  fr: 'Actif maintenant',
  es: 'Activo ahora',
};

// يعيد null عندما لا يجب عرض شيء (حالة مخفية / لا يوجد آخر ظهور / قديم جداً)
export const formatPresence = (info: PresenceInfo | undefined, lang: string, now: number = Date.now()): string | null => {
  if (!info || !info.visible || info.lastActive <= 0) return null;
  const l = pickLang(lang);
  if (info.online) return NOW_TEXT[l];

  const diff = Math.max(0, now - info.lastActive);
  if (diff > LAST_SEEN_MAX_MS) return null;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return agoText(l, Math.max(1, minutes), 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return agoText(l, hours, 'hour');
  return agoText(l, Math.floor(hours / 24), 'day');
};
