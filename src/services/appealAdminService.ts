import {
  addDoc, collection, deleteField, doc, getDoc, getDocs, limit, query,
  serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logAdmin } from './adminLog';
import { YELLOW_DAYS } from './accountStatusService';

const DAY = 24 * 60 * 60 * 1000;

export interface AppealItem {
  uid: string;
  kind: 'warning' | 'restrict' | 'ban';
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

const ms = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : 0);

/** كل الطعون: المعلّقة أولاً ثم الأحدث */
export const listAppeals = async (): Promise<AppealItem[]> => {
  const snap = await getDocs(query(collection(db, 'appeals'), limit(100)));
  const items: AppealItem[] = snap.docs.map((d) => {
    const x = d.data();
    const st = String(x.status || 'pending');
    const kind = String(x.kind || 'warning');
    return {
      uid: d.id,
      kind: kind === 'ban' || kind === 'restrict' ? kind : 'warning',
      message: String(x.message || ''),
      status: st === 'accepted' || st === 'rejected' ? st : 'pending',
      createdAt: ms(x.createdAt),
    };
  });
  items.sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
  return items;
};

const notifyUser = async (toUid: string, adminUid: string, code: string): Promise<void> => {
  try {
    await addDoc(collection(db, 'notifications'), {
      toUid,
      fromUid: adminUid,
      fromName: 'AnimeVerse',
      type: 'moderation',
      text: `mod:${code}`,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('appeal notification failed:', e);
  }
};

/**
 * قبول الطعن: يُسقَط إنذار واحد، ويُرفع التقييد، ويُرفع الإغلاق إن كان الطعن على إغلاق.
 * تنبيه: المحتوى الذي حُذف عند الإغلاق لا يمكن استرجاعه.
 */
export const acceptAppeal = async (a: AppealItem, adminUid: string): Promise<void> => {
  const modRef = doc(db, 'moderation', a.uid);
  const snap = await getDoc(modRef);
  const strikes = Math.max(0, (Number(snap.data()?.strikes ?? 0) || 0) - 1);

  await setDoc(
    modRef,
    { strikes, banned: false, restrictedUntil: deleteField(), updatedAt: serverTimestamp() },
    { merge: true }
  );

  await setDoc(
    doc(db, 'accountStanding', a.uid),
    {
      level: strikes > 0 ? 'yellow' : 'green',
      strikes,
      until: strikes > 0 ? Timestamp.fromMillis(Date.now() + YELLOW_DAYS * DAY) : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (a.kind === 'ban') {
    await updateDoc(doc(db, 'users', a.uid), { isBanned: false, updatedAt: serverTimestamp() });
  }

  await updateDoc(doc(db, 'appeals', a.uid), {
    status: 'accepted',
    resolvedBy: adminUid,
    resolvedAt: serverTimestamp(),
  });

  await notifyUser(a.uid, adminUid, 'appealAccepted');
  logAdmin('appeal_accepted', 'user', a.uid, a.kind);
};

/** رفض الطعن: يبقى القرار كما هو */
export const rejectAppeal = async (a: AppealItem, adminUid: string): Promise<void> => {
  await updateDoc(doc(db, 'appeals', a.uid), {
    status: 'rejected',
    resolvedBy: adminUid,
    resolvedAt: serverTimestamp(),
  });
  await notifyUser(a.uid, adminUid, 'appealRejected');
  logAdmin('appeal_rejected', 'user', a.uid, a.kind);
};
