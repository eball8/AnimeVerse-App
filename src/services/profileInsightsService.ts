import { db } from '../config/firebase';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (): string => new Date().toISOString().slice(0, 10).replace(/-/g, '');

// تسجيل زيارة ملف شخصي: مرة واحدة لكل زائر في اليوم (معرّف الوثيقة ثابت فلا تتكرر)
export const recordProfileView = async (profileUid: string, viewerUid: string): Promise<void> => {
  if (!profileUid || !viewerUid || profileUid === viewerUid) return;
  const day = dayKey();
  const memo = `pv_${profileUid}_${day}`;
  try {
    if (sessionStorage.getItem(memo)) return;
    sessionStorage.setItem(memo, '1');
  } catch {
    /* التخزين غير متاح: نكمل بدون تذكّر الجلسة */
  }
  try {
    await setDoc(doc(db, 'profileViews', `${profileUid}_${viewerUid}_${day}`), {
      profileUid,
      viewerId: viewerUid,
      day,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* الزيارة مسجّلة مسبقاً اليوم، أو القواعد لم تُنشر بعد: لا نزعج المستخدم */
  }
};

export interface ProfileInsights {
  reach: number;
  reachGrowth: number | null;
  views: number;
  viewsGrowth: number | null;
}

const growthPct = (cur: number, prev: number): number | null => {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
};

// إحصائيات آخر 7 أيام مقارنةً بالأسبوع الذي قبله (يقرأها صاحب الحساب فقط)
export const getProfileInsights = async (uid: string): Promise<ProfileInsights> => {
  const snap = await getDocs(query(collection(db, 'profileViews'), where('profileUid', '==', uid), limit(1000)));
  const now = Date.now();
  const curViewers = new Set<string>();
  const prevViewers = new Set<string>();
  let curViews = 0;
  let prevViews = 0;

  snap.forEach((d) => {
    const x = d.data() as any;
    const t: number = x.createdAt?.toMillis?.() ?? 0;
    if (!t) return;
    const age = now - t;
    if (age <= 7 * DAY_MS) {
      curViews += 1;
      curViewers.add(x.viewerId);
    } else if (age <= 14 * DAY_MS) {
      prevViews += 1;
      prevViewers.add(x.viewerId);
    }
  });

  return {
    reach: curViewers.size,
    reachGrowth: growthPct(curViewers.size, prevViewers.size),
    views: curViews,
    viewsGrowth: growthPct(curViews, prevViews),
  };
};
