import {
  collection, doc, documentId, getDoc, getDocs, limit, onSnapshot, query,
  serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type StatusLevel = 'green' | 'yellow' | 'red' | 'closed';
export type AppealKind = 'warning' | 'restrict' | 'ban';

const DAY = 24 * 60 * 60 * 1000;
export const YELLOW_DAYS = 30; // مدة الحالة الصفراء
export const RED_DAYS = 60; // مدة الحالة الحمراء
export const APPEAL_DAYS = 60; // مهلة الطعن (لا تقل عن 60 يوماً)

/** نسبة منشوراتك التي يُسمح بظهورها للآخرين */
export const REACH: Record<StatusLevel, number> = {
  green: 1,
  yellow: 0.5,
  red: 0.15,
  closed: 0,
};

export const LEVEL_UI: Record<StatusLevel, { text: string; bg: string; border: string; dot: string }> = {
  green: { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  yellow: { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  red: { text: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30', dot: 'bg-red-500' },
  closed: { text: 'text-red-500', bg: 'bg-red-600/20', border: 'border-red-600/40', dot: 'bg-red-600' },
};

/** يحدد مستوى الحالة بعد قرار إشرافي */
export const standingFor = (strikes: number, action: string): { level: StatusLevel; days: number } => {
  if (action === 'ban') return { level: 'closed', days: 0 };
  if (action === 'restrict' || strikes >= 3) return { level: 'red', days: RED_DAYS };
  return { level: 'yellow', days: YELLOW_DAYS };
};

const ms = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : 0);

/* ---------------------- حالة الحساب (حيّة) ---------------------- */
export interface AccountStatus {
  level: StatusLevel;
  strikes: number;
  /** وقت انتهاء الأثر (0 = لا شيء) */
  until: number;
  /** وقت آخر قرار */
  since: number;
  /** آخر موعد للطعن (0 = غير معروف) */
  appealUntil: number;
}

export const subscribeAccountStatus = (uid: string, cb: (s: AccountStatus) => void): (() => void) => {
  let banned = false;
  let strikes = 0;
  let restrictedUntil = 0;
  let modAt = 0;
  let standLevel: StatusLevel | '' = '';
  let standUntil = 0;
  let standAt = 0;

  const emit = () => {
    const now = Date.now();
    let level: StatusLevel = 'green';
    let until = 0;
    if (banned) {
      level = 'closed';
    } else if (restrictedUntil > now) {
      level = 'red';
      until = Math.max(restrictedUntil, standLevel === 'red' ? standUntil : 0);
    } else if ((standLevel === 'yellow' || standLevel === 'red') && standUntil > now) {
      level = standLevel;
      until = standUntil;
    }
    const since = Math.max(modAt, standAt);
    cb({ level, strikes, until, since, appealUntil: since ? since + APPEAL_DAYS * DAY : 0 });
  };

  const unsubs: Array<() => void> = [];
  unsubs.push(
    onSnapshot(doc(db, 'users', uid), (s) => {
      banned = s.data()?.isBanned === true;
      emit();
    }, () => {})
  );
  unsubs.push(
    onSnapshot(doc(db, 'moderation', uid), (s) => {
      const d = s.data();
      strikes = Number(d?.strikes ?? 0) || 0;
      restrictedUntil = ms(d?.restrictedUntil);
      modAt = ms(d?.updatedAt);
      emit();
    }, () => {})
  );
  unsubs.push(
    onSnapshot(doc(db, 'accountStanding', uid), (s) => {
      const d = s.data();
      standLevel = (d?.level as StatusLevel) || '';
      standUntil = ms(d?.until);
      standAt = ms(d?.updatedAt);
      emit();
    }, () => {})
  );
  return () => unsubs.forEach((u) => u());
};

/* ---------------------- سجل الإنذارات والقرارات ---------------------- */
export interface StatusEvent {
  id: string;
  code: string;
  targetType?: string;
  createdAt: number;
  until: number;
}

export const subscribeStatusEvents = (uid: string, cb: (items: StatusEvent[]) => void): (() => void) =>
  onSnapshot(
    query(collection(db, 'moderation', uid, 'notices'), limit(50)),
    (snap) => {
      const items: StatusEvent[] = snap.docs
        .map((d) => {
          const x = d.data();
          return {
            id: d.id,
            code: String(x.code || ''),
            targetType: x.targetType ? String(x.targetType) : undefined,
            createdAt: ms(x.createdAt),
            until: ms(x.until),
          };
        })
        .filter((e) => ['warn', 'delete', 'restrict', 'ban'].includes(e.code));
      items.sort((a, b) => b.createdAt - a.createdAt);
      cb(items);
    },
    () => {}
  );

/* ---------------------- الطعن ---------------------- */
export interface Appeal {
  status: 'pending' | 'accepted' | 'rejected';
  message: string;
  createdAt: number;
}

export const getMyAppeal = async (uid: string): Promise<Appeal | null> => {
  try {
    const s = await getDoc(doc(db, 'appeals', uid));
    if (!s.exists()) return null;
    const d = s.data();
    const st = String(d.status || 'pending');
    return {
      status: st === 'accepted' || st === 'rejected' ? st : 'pending',
      message: String(d.message || ''),
      createdAt: ms(d.createdAt),
    };
  } catch {
    return null;
  }
};

export const submitAppeal = async (uid: string, kind: AppealKind, message: string): Promise<void> => {
  await setDoc(doc(db, 'appeals', uid), {
    uid,
    kind,
    message: message.trim().slice(0, 1000),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
};

/* ---------------------- تقليل الوصول (يُستخدم في المرحلة الثانية) ---------------------- */
const standCache = new Map<string, { level: StatusLevel; at: number }>();
const CACHE_MS = 5 * 60 * 1000;

export const loadStandings = async (uids: string[]): Promise<Record<string, StatusLevel>> => {
  const out: Record<string, StatusLevel> = {};
  const now = Date.now();
  const need: string[] = [];
  Array.from(new Set(uids.filter(Boolean))).forEach((u) => {
    const c = standCache.get(u);
    if (c && now - c.at < CACHE_MS) out[u] = c.level;
    else need.push(u);
  });
  for (let i = 0; i < need.length; i += 10) {
    const chunk = need.slice(i, i + 10);
    try {
      const snap = await getDocs(query(collection(db, 'accountStanding'), where(documentId(), 'in', chunk)));
      const found = new Set<string>();
      snap.forEach((d) => {
        const x = d.data();
        const lv = x.level as StatusLevel;
        const active = lv === 'closed' || ms(x.until) > now;
        const level: StatusLevel = active && (lv === 'yellow' || lv === 'red' || lv === 'closed') ? lv : 'green';
        out[d.id] = level;
        standCache.set(d.id, { level, at: now });
        found.add(d.id);
      });
      chunk.forEach((u) => {
        if (!found.has(u)) {
          out[u] = 'green';
          standCache.set(u, { level: 'green', at: now });
        }
      });
    } catch {
      chunk.forEach((u) => (out[u] = 'green'));
    }
  }
  return out;
};

const hash01 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
};

/** قرار ثابت لكل منشور: لا يتغير مع كل تحديث للصفحة */
export const isVisibleByReach = (postId: string, level: StatusLevel): boolean =>
  hash01(postId) < REACH[level];
