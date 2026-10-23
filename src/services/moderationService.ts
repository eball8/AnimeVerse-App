import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logAdmin } from './adminLog';
import { standingFor } from './accountStatusService';

/* ------------------------------------------------------------------
   نظام الإشراف: إنذارات، تقييد مؤقت، حظر، وردود على المُبلِّغين.
   - بريد الدعم للاعتراض على القرارات (اتركه فارغاً لإخفائه)
------------------------------------------------------------------ */
export const SUPPORT_EMAIL = '';

export type ModAction = 'dismiss' | 'warn' | 'delete' | 'restrict' | 'ban';
export type ReportDoc = { id: string; [key: string]: any };

const RANK: Record<ModAction, number> = { dismiss: 0, warn: 1, delete: 2, restrict: 3, ban: 4 };
const DAY = 24 * 60 * 60 * 1000;
const POST_TYPES = ['post', 'video', 'reel'];

/** أسباب عاجلة: تظهر بعلامة حمراء في لوحة الأدمن */
export const URGENT_CATEGORIES = ['nudity', 'violence'];
/** بلاغات إيذاء النفس: لا تُحتسب مخالفة على صاحبها (قد يكون في أزمة) */
export const WELFARE_CATEGORIES = ['selfharm'];

export const canDeleteTarget = (targetType: string): boolean =>
  POST_TYPES.includes(targetType) || ['story', 'comment', 'message'].includes(targetType);

export interface ModPlan {
  base: ModAction;
  effective: ModAction;
  /** عدد المخالفات بعد هذا القرار */
  strikes: number;
  days: number;
}

/* ---------------------- معرفة صاحب المحتوى ---------------------- */
export const resolveOffenderUid = async (r: ReportDoc): Promise<string | undefined> => {
  if (typeof r.reportedUid === 'string' && r.reportedUid) return r.reportedUid;
  try {
    if (r.targetType === 'user') return String(r.targetId);
    const col = POST_TYPES.includes(r.targetType)
      ? 'posts'
      : r.targetType === 'story'
      ? 'stories'
      : r.targetType === 'comment'
      ? 'comments'
      : '';
    if (!col) return undefined;
    const s = await getDoc(doc(db, col, String(r.targetId)));
    const a = s.data()?.authorId;
    return typeof a === 'string' ? a : undefined;
  } catch {
    return undefined;
  }
};

/* ---------------------- خطة القرار + التصعيد ---------------------- */
export const planAction = async (
  offender: string | undefined,
  base: ModAction,
  days: number,
  category = ''
): Promise<ModPlan> => {
  if (base === 'dismiss' || !offender) return { base, effective: base, strikes: 0, days };

  let prev = 0;
  try {
    const s = await getDoc(doc(db, 'moderation', offender));
    prev = Number(s.data()?.strikes ?? 0) || 0;
  } catch {
    /* نتابع بدون تاريخ سابق */
  }

  const welfare = WELFARE_CATEGORIES.includes(category);
  const strikes = welfare ? prev : prev + 1;
  let effective: ModAction = base;
  let d = days;

  if (!welfare && base !== 'ban') {
    if (strikes >= 4) {
      effective = 'ban';
    } else if (strikes === 3 && RANK[effective] < RANK.restrict) {
      effective = 'restrict';
      d = Math.max(d, 7);
    }
  }
  return { base, effective, strikes, days: d };
};

/* ---------------------- حذف المحتوى ---------------------- */
const deleteTarget = async (r: ReportDoc): Promise<void> => {
  const id = String(r.targetId);
  if (POST_TYPES.includes(r.targetType)) {
    const postSnap = await getDoc(doc(db, 'posts', id));
    const authorId = postSnap.exists() ? postSnap.data().authorId : undefined;
    const cs = await getDocs(query(collection(db, 'comments'), where('postId', '==', id), limit(300)));
    const batch = writeBatch(db);
    batch.delete(doc(db, 'posts', id));
    cs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (typeof authorId === 'string') {
      updateDoc(doc(db, 'users', authorId), { postsCount: increment(-1) }).catch(() => {});
    }
    return;
  }
  if (r.targetType === 'story') {
    await deleteDoc(doc(db, 'stories', id));
    return;
  }
  if (r.targetType === 'comment') {
    await deleteDoc(doc(db, 'comments', id));
    return;
  }
  if (r.targetType === 'message') {
    const i = id.indexOf(':');
    if (i > 0) await deleteDoc(doc(db, 'conversations', id.slice(0, i), 'messages', id.slice(i + 1)));
  }
};

/* ---------------------- مسح كل محتوى المحظور ---------------------- */
const purgeUserContent = async (uid: string): Promise<void> => {
  for (const col of ['posts', 'stories', 'comments']) {
    for (let round = 0; round < 10; round++) {
      const snap = await getDocs(query(collection(db, col), where('authorId', '==', uid), limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
};

/* ---------------------- حفظ الدليل (للحماية القانونية) ---------------------- */
const saveEvidence = async (
  r: ReportDoc,
  offender: string | undefined,
  action: ModAction,
  adminUid: string
): Promise<void> => {
  let content: Record<string, unknown> = {};
  try {
    const col = POST_TYPES.includes(r.targetType)
      ? 'posts'
      : r.targetType === 'story'
      ? 'stories'
      : r.targetType === 'comment'
      ? 'comments'
      : '';
    if (col) {
      const s = await getDoc(doc(db, col, String(r.targetId)));
      if (s.exists()) {
        const d = s.data();
        content = {
          authorId: d.authorId ?? null,
          text: d.content ?? d.caption ?? null,
          mediaUrl: d.mediaUrl ?? null,
          mediaType: d.mediaType ?? null,
        };
      }
    }
  } catch {
    /* الدليل الأساسي هو لقطات المُبلِّغ */
  }
  await setDoc(doc(db, 'moderationCases', r.id), {
    reportId: r.id,
    targetType: String(r.targetType),
    targetId: String(r.targetId),
    category: String(r.category ?? ''),
    reason: String(r.reason ?? '').slice(0, 500),
    offenderUid: offender ?? null,
    action,
    content,
    screenshots: Array.isArray(r.screenshots) ? r.screenshots : [],
    adminUid,
    createdAt: serverTimestamp(),
  });
};

/* ---------------------- حالة الحساب + إشعار المخالِف ---------------------- */
const updateStandingAndNotify = async (
  offender: string,
  eff: ModAction,
  plan: ModPlan,
  category: string,
  adminUid: string
): Promise<void> => {
  // بلاغات إيذاء النفس لا تغيّر حالة الحساب ولا تُحتسب مخالفة
  if (WELFARE_CATEGORIES.includes(category)) return;
  try {
    const st = standingFor(plan.strikes, eff);
    await setDoc(
      doc(db, 'accountStanding', offender),
      {
        level: st.level,
        strikes: plan.strikes,
        until: st.days > 0 ? Timestamp.fromMillis(Date.now() + st.days * DAY) : null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const code =
      eff === 'ban'
        ? 'ban'
        : eff === 'restrict'
        ? 'restrict'
        : st.level === 'red'
        ? 'danger'
        : eff === 'delete'
        ? 'delete'
        : 'warn';

    await addDoc(collection(db, 'notifications'), {
      toUid: offender,
      fromUid: adminUid,
      fromName: 'AnimeVerse',
      type: 'moderation',
      text: `mod:${code}`,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // فشل الإشعار أو الحالة لا يجب أن يوقف تنفيذ القرار نفسه
    console.error('account status update failed:', e);
  }
};

/* ---------------------- تنفيذ القرار ---------------------- */
export const applyAction = async (
  main: ReportDoc,
  plan: ModPlan,
  offender: string | undefined,
  adminUid: string
): Promise<void> => {
  const snap = await getDocs(
    query(collection(db, 'reports'), where('targetId', '==', main.targetId), limit(100))
  );
  const related: ReportDoc[] = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ReportDoc))
    .filter((r) => r.status === 'pending' && r.targetType === main.targetType);
  if (!related.some((r) => r.id === main.id)) related.push(main);

  const eff = plan.effective;

  if (eff !== 'dismiss') {
    await saveEvidence(main, offender, eff, adminUid);
    if (RANK[eff] >= RANK.delete) await deleteTarget(main);

    if (offender) {
      const until = eff === 'restrict' ? Timestamp.fromMillis(Date.now() + plan.days * DAY) : null;

      await setDoc(
        doc(db, 'moderation', offender),
        {
          strikes: plan.strikes,
          lastAction: eff,
          lastCategory: String(main.category ?? ''),
          updatedAt: serverTimestamp(),
          ...(until ? { restrictedUntil: until } : {}),
          ...(eff === 'ban' ? { banned: true, bannedAt: serverTimestamp() } : {}),
        },
        { merge: true }
      );

      await addDoc(collection(db, 'moderation', offender, 'notices'), {
        code: eff,
        category: String(main.category ?? '').slice(0, 40),
        targetType: String(main.targetType),
        seen: false,
        createdAt: serverTimestamp(),
        ...(until ? { until } : {}),
      });

      await updateStandingAndNotify(offender, eff, plan, String(main.category ?? ''), adminUid);

      if (eff === 'ban') {
        await updateDoc(doc(db, 'users', offender), { isBanned: true, updatedAt: serverTimestamp() });
        await purgeUserContent(offender);
      }
    }
  }

  // إغلاق كل البلاغات على نفس المحتوى + الرد على كل مُبلِّغ
  for (const r of related) {
    await updateDoc(doc(db, 'reports', r.id), {
      status: eff === 'dismiss' ? 'dismissed' : 'resolved',
      action: eff,
      resolvedBy: adminUid,
      resolvedAt: serverTimestamp(),
    });
    if (typeof r.ticketId === 'string' && r.ticketId) {
      await setDoc(doc(db, 'reportTickets', r.ticketId), {
        status: eff === 'dismiss' ? 'no_violation' : 'violation',
        targetType: String(r.targetType),
        createdAt: serverTimestamp(),
      });
    }
  }

  logAdmin(`report_${eff}`, 'report', main.id, `${main.targetType}:${main.targetId}`.slice(0, 280));
};

/* ---------------------- بلاغات المشاكل التقنية ---------------------- */
export const closeBugReport = async (r: ReportDoc, fixed: boolean, adminUid: string): Promise<void> => {
  await updateDoc(doc(db, 'reports', r.id), {
    status: fixed ? 'resolved' : 'dismissed',
    resolvedBy: adminUid,
    resolvedAt: serverTimestamp(),
  });
  if (typeof r.ticketId === 'string' && r.ticketId) {
    await setDoc(doc(db, 'reportTickets', r.ticketId), {
      status: fixed ? 'bug_fixed' : 'no_action',
      targetType: 'app',
      createdAt: serverTimestamp(),
    });
  }
  logAdmin(fixed ? 'resolve_report' : 'dismiss_report', 'report', r.id);
};
