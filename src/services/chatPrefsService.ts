
import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Conversation } from './chatService';

// ---------------------------------------------------------------
// إعدادات المحادثة الشخصية (تخصّك أنت فقط ولا يراها الطرف الآخر):
// كتم / تقييد / أرشفة / حذف عندي
// المسار: chatPrefs/{userId}_{convId}
// ---------------------------------------------------------------
export interface ChatPref {
  muted: boolean;
  restricted: boolean;
  archived: boolean;
  /** وقت "حذف المحادثة عندي" بالميلي ثانية؛ تظهر المحادثة من جديد إذا وصلت رسالة بعده */
  deletedAt?: number;
}

export type ChatPrefMap = Record<string, ChatPref>;

const DEFAULT_PREF: ChatPref = { muted: false, restricted: false, archived: false };

const prefDocId = (me: string, convId: string) => `${me}_${convId}`;

/** الاشتراك في كل إعدادات محادثات المستخدم. يعيد دالة إلغاء الاشتراك. */
export const subscribeChatPrefs = (me: string, cb: (map: ChatPrefMap) => void): (() => void) => {
  const q = query(collection(db, 'chatPrefs'), where('userId', '==', me));
  return onSnapshot(
    q,
    (snap) => {
      const map: ChatPrefMap = {};
      snap.forEach((d) => {
        const data = d.data() as any;
        if (!data?.convId) return;
        map[data.convId] = {
          muted: data.muted === true,
          restricted: data.restricted === true,
          archived: data.archived === true,
          deletedAt: typeof data.deletedAt === 'number' ? data.deletedAt : undefined,
        };
      });
      cb(map);
    },
    (err) => {
      console.error('subscribeChatPrefs', err);
      cb({});
    }
  );
};

/**
 * تعديل إعدادات محادثة. تُدمج القيم الجديدة مع القيم الحالية (current)
 * لأن قواعد Firestore تشترط وجود muted و restricted في كل كتابة.
 */
export const setChatPref = async (
  me: string,
  convId: string,
  patch: Partial<ChatPref>,
  current?: ChatPref
): Promise<void> => {
  const next: ChatPref = { ...DEFAULT_PREF, ...(current || {}), ...patch };
  const id = prefDocId(me, convId);

  // إن عادت كل القيم لوضعها الافتراضي نحذف المستند للتنظيف
  const isDefault = !next.muted && !next.restricted && !next.archived && next.deletedAt === undefined;
  if (isDefault) {
    await deleteDoc(doc(db, 'chatPrefs', id));
    return;
  }

  const data: Record<string, unknown> = {
    userId: me,
    convId,
    muted: next.muted,
    restricted: next.restricted,
    archived: next.archived,
    updatedAt: serverTimestamp(),
  };
  if (next.deletedAt !== undefined) data.deletedAt = Math.floor(next.deletedAt);

  await setDoc(doc(db, 'chatPrefs', id), data);
};

const lastMessageMs = (c: Conversation): number => c.lastMessageAt?.toMillis?.() ?? Date.now();

/** هل المحادثة محذوفة عندي (ولم تصل رسالة جديدة بعد الحذف)؟ */
export const isDeletedForMe = (c: Conversation, pref?: ChatPref): boolean =>
  !!pref?.deletedAt && lastMessageMs(c) <= pref.deletedAt;

/** تظهر في قائمة الرسائل: غير مؤرشفة وغير محذوفة */
export const isInMainList = (c: Conversation, pref?: ChatPref): boolean =>
  !pref?.archived && !isDeletedForMe(c, pref);

/** تظهر في الأرشيف: مؤرشفة وغير محذوفة */
export const isInArchive = (c: Conversation, pref?: ChatPref): boolean =>
  !!pref?.archived && !isDeletedForMe(c, pref);
