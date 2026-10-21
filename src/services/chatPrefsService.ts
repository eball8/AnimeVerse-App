import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';

// إعدادات شخصية لكل محادثة (لا يراها الطرف الآخر)
export interface ChatPref {
  muted: boolean;
  restricted: boolean;
  /** المحادثة مؤرشفة: تختفي من قائمة الرسائل وتظهر في الأرشيف */
  archived: boolean;
  /** وقت حذف المحادثة عندي (ميلي ثانية). كل ما قبله مخفي عندي فقط، والطرف الآخر لا يتأثر. 0 = غير محذوفة */
  deletedAt: number;
}

export type ChatPrefMap = Record<string, ChatPref>;

const prefId = (uid: string, convId: string) => `${uid}_${convId}`;

export const subscribeChatPrefs = (uid: string, cb: (m: ChatPrefMap) => void) => {
  const q = query(collection(db, 'chatPrefs'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const out: ChatPrefMap = {};
      snap.forEach((d) => {
        const x = d.data() as {
          convId?: string; muted?: boolean; restricted?: boolean; archived?: boolean; deletedAt?: number;
        };
        if (x.convId) {
          out[x.convId] = {
            muted: !!x.muted,
            restricted: !!x.restricted,
            archived: !!x.archived,
            deletedAt: typeof x.deletedAt === 'number' ? x.deletedAt : 0,
          };
        }
      });
      cb(out);
    },
    (e) => console.error('chatPrefs error:', e)
  );
};

export const setChatPref = async (
  uid: string,
  convId: string,
  patch: Partial<ChatPref>,
  current?: ChatPref
): Promise<void> => {
  const next: ChatPref = {
    muted: current?.muted ?? false,
    restricted: current?.restricted ?? false,
    archived: current?.archived ?? false,
    deletedAt: current?.deletedAt ?? 0,
    ...patch,
  };
  await setDoc(doc(db, 'chatPrefs', prefId(uid, convId)), {
    userId: uid,
    convId,
    muted: next.muted,
    restricted: next.restricted,
    archived: next.archived,
    deletedAt: Math.floor(next.deletedAt),
    updatedAt: serverTimestamp(),
  });
};

// ---------------------------------------------------------------
// حالة ظهور المحادثة في القائمة
// ---------------------------------------------------------------

/** وقت آخر رسالة بالميلي ثانية (الرسالة التي لم يصلها وقت الخادم بعد تُعتبر الآن) */
export const lastMessageMs = (c: { lastMessageAt?: any }): number =>
  c.lastMessageAt?.toMillis?.() ?? Date.now();

/** هل حذفتُ هذه المحادثة ولم تصل بعدها رسالة جديدة؟ */
export const isDeletedForMe = (c: { lastMessageAt?: any }, pref?: ChatPref): boolean =>
  !!pref?.deletedAt && lastMessageMs(c) <= pref.deletedAt;

/** المحادثات التي تظهر في قائمة الرسائل الرئيسية */
export const isInMainList = (c: { lastMessageAt?: any }, pref?: ChatPref): boolean =>
  !pref?.archived && !isDeletedForMe(c, pref);

/** المحادثات التي تظهر في الأرشيف */
export const isInArchive = (c: { lastMessageAt?: any }, pref?: ChatPref): boolean =>
  !!pref?.archived && !isDeletedForMe(c, pref);
