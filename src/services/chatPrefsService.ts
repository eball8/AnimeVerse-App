import {
  collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Conversation } from './chatService';

// ---------------------------------------------------------------
// إعدادات المحادثة الشخصية (تخصّك أنت فقط ولا يراها الطرف الآخر):
// كتم / تقييد / أرشفة / حذف عندي / تثبيت / قبول طلب المراسلة
// المسار: chatPrefs/{userId}_{convId}
// ---------------------------------------------------------------
export interface ChatPref {
  muted: boolean;
  restricted: boolean;
  archived: boolean;
  /** وقت "حذف المحادثة عندي" بالميلي ثانية؛ تظهر المحادثة من جديد إذا وصلت رسالة بعده */
  deletedAt?: number;
  /** وقت تثبيت المحادثة بالميلي ثانية (غير موجود = غير مثبتة). الحد الأقصى 3 محادثات مثبتة */
  pinnedAt?: number;
  /** true = قبلتُ طلب المراسلة (أو رددتُ على المحادثة) فتبقى في الوارد */
  accepted?: boolean;
}

export type ChatPrefMap = Record<string, ChatPref>;

/** الحد الأقصى للمحادثات المثبتة في أعلى القائمة */
export const MAX_PINNED_CHATS = 3;

const DEFAULT_PREF: ChatPref = { muted: false, restricted: false, archived: false };

const prefDocId = (me: string, convId: string) => `${me}_${convId}`;

const parsePref = (data: any): ChatPref => ({
  muted: data.muted === true,
  restricted: data.restricted === true,
  archived: data.archived === true,
  deletedAt: typeof data.deletedAt === 'number' ? data.deletedAt : undefined,
  pinnedAt: typeof data.pinnedAt === 'number' ? data.pinnedAt : undefined,
  accepted: data.accepted === true ? true : undefined,
});

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
        map[data.convId] = parsePref(data);
      });
      cb(map);
    },
    (err) => {
      console.error('subscribeChatPrefs', err);
      cb({});
    }
  );
};

/** قراءة طازجة (مرة واحدة) لكل إعدادات محادثاتي */
export const fetchChatPrefs = async (me: string): Promise<ChatPrefMap> => {
  const snap = await getDocs(query(collection(db, 'chatPrefs'), where('userId', '==', me)));
  const map: ChatPrefMap = {};
  snap.forEach((d) => {
    const data = d.data() as any;
    if (!data?.convId) return;
    map[data.convId] = parsePref(data);
  });
  return map;
};

/**
 * قراءة إعدادات محادثة واحدة.
 * نستخدم استعلاماً (وليس getDoc) لأن القراءة المباشرة لوثيقة غير موجودة تُرفض بالقواعد.
 */
export const getChatPref = async (me: string, convId: string): Promise<ChatPref | undefined> => {
  const snap = await getDocs(
    query(collection(db, 'chatPrefs'), where('userId', '==', me), where('convId', '==', convId), limit(1))
  );
  if (snap.empty) return undefined;
  return parsePref(snap.docs[0].data());
};

/**
 * تعديل إعدادات محادثة. تُدمج القيم الجديدة مع القيم الحالية (current)
 * لأن قواعد Firestore تشترط وجود muted و restricted في كل كتابة.
 * أرشفة المحادثة أو حذفها عندي تُلغي تثبيتها تلقائياً.
 */
export const setChatPref = async (
  me: string,
  convId: string,
  patch: Partial<ChatPref>,
  current?: ChatPref
): Promise<void> => {
  const next: ChatPref = { ...DEFAULT_PREF, ...(current || {}), ...patch };
  if (!('pinnedAt' in patch) && (patch.archived === true || patch.deletedAt !== undefined)) {
    next.pinnedAt = undefined;
  }
  const id = prefDocId(me, convId);

  // إن عادت كل القيم لوضعها الافتراضي نحذف المستند للتنظيف
  const isDefault =
    !next.muted &&
    !next.restricted &&
    !next.archived &&
    next.deletedAt === undefined &&
    next.pinnedAt === undefined &&
    !next.accepted;
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
  if (next.pinnedAt !== undefined) data.pinnedAt = Math.floor(next.pinnedAt);
  if (next.accepted) data.accepted = true;

  await setDoc(doc(db, 'chatPrefs', id), data);
};

// ---------------------------------------------------------------
// تثبيت المحادثات (حد أقصى 3). نقرأ الحالة الطازجة من الخادم قبل الحفظ
// حتى لا يتجاوز المستخدم الحد من جهازين مختلفين.
// يرمي Error('PIN_LIMIT') عند تجاوز الحد.
// ---------------------------------------------------------------
export const setChatsPinned = async (me: string, convIds: string[], pin: boolean): Promise<void> => {
  const fresh = await fetchChatPrefs(me);

  if (pin) {
    const pinnedNow = Object.values(fresh).filter((p) => p.pinnedAt !== undefined).length;
    const toAdd = Array.from(new Set(convIds)).filter((id) => fresh[id]?.pinnedAt === undefined);
    if (toAdd.length === 0) return;
    if (pinnedNow + toAdd.length > MAX_PINNED_CHATS) throw new Error('PIN_LIMIT');
    const base = Date.now();
    await Promise.all(toAdd.map((id, i) => setChatPref(me, id, { pinnedAt: base + i }, fresh[id])));
    return;
  }

  const toRemove = Array.from(new Set(convIds)).filter((id) => fresh[id]?.pinnedAt !== undefined);
  await Promise.all(toRemove.map((id) => setChatPref(me, id, { pinnedAt: undefined }, fresh[id])));
};

// ---------------------------------------------------------------
// طلبات المراسلة
// ---------------------------------------------------------------

/** قبول طلب مراسلة: تنتقل المحادثة إلى الوارد */
export const acceptMessageRequest = async (me: string, convId: string, current?: ChatPref): Promise<void> => {
  const cur = current ?? (await getChatPref(me, convId));
  await setChatPref(me, convId, { accepted: true }, cur);
};

export interface FollowRelations {
  /** من أتابعهم أنا */
  following: Set<string>;
  /** من يتابعونني */
  followers: Set<string>;
}

/** الاشتراك المباشر في علاقات المتابعة (من أتابعه ومن يتابعني) */
export const subscribeFollowRelations = (me: string, cb: (rel: FollowRelations) => void): (() => void) => {
  let following: Set<string> | null = null;
  let followers: Set<string> | null = null;
  const emit = () => {
    if (following && followers) cb({ following, followers });
  };

  const unsubA = onSnapshot(
    query(collection(db, 'follows'), where('followerId', '==', me), limit(1000)),
    (snap) => {
      following = new Set(snap.docs.map((d) => d.data().followingId as string));
      emit();
    },
    (e) => {
      console.error('follow relations (following) error:', e);
      if (!following) following = new Set();
      emit();
    }
  );
  const unsubB = onSnapshot(
    query(collection(db, 'follows'), where('followingId', '==', me), limit(1000)),
    (snap) => {
      followers = new Set(snap.docs.map((d) => d.data().followerId as string));
      emit();
    },
    (e) => {
      console.error('follow relations (followers) error:', e);
      if (!followers) followers = new Set();
      emit();
    }
  );
  return () => {
    unsubA();
    unsubB();
  };
};

const lastMessageMs = (c: Conversation): number => c.lastMessageAt?.toMillis?.() ?? Date.now();

/** هل المحادثة محذوفة عندي (ولم تصل رسالة جديدة بعد الحذف)؟ */
export const isDeletedForMe = (c: Conversation, pref?: ChatPref): boolean =>
  !!pref?.deletedAt && lastMessageMs(c) <= pref.deletedAt;

/**
 * هل هذه المحادثة "طلب مراسلة" عندي؟
 * - المجموعات والمحادثات التي بدأتُها أنا والمحادثات القديمة (بلا starterId) ليست طلبات.
 * - إن قبلتُ الطلب أو رددتُ على المحادثة (accepted) تنتقل إلى الوارد.
 * - إن كنتُ أتابع المرسل تذهب إلى الوارد.
 * - حسابي عام: إن كان المرسل يتابعني تذهب إلى الوارد؛ وإن لم يكن أحدنا يتابع الآخر فهي طلب.
 * - حسابي خاص: حتى لو كان المرسل يتابعني (بعد قبول طلبه) تبقى طلباً حتى أرد أو أتابعه.
 */
export const isMessageRequest = (
  c: Conversation,
  me: string,
  pref: ChatPref | undefined,
  rel: FollowRelations,
  myAccountType: 'public' | 'private'
): boolean => {
  if (c.type === 'group') return false;
  if (!c.starterId || c.starterId === me) return false;
  if (pref?.accepted) return false;
  const other = c.otherUid;
  if (!other) return false;
  if (rel.following.has(other)) return false;
  if (myAccountType !== 'private' && rel.followers.has(other)) return false;
  return true;
};

/** تظهر في قائمة الرسائل (الوارد أو الطلبات): غير مؤرشفة وغير محذوفة */
export const isInMainList = (c: Conversation, pref?: ChatPref): boolean =>
  !pref?.archived && !isDeletedForMe(c, pref);

/** تظهر في الأرشيف: مؤرشفة وغير محذوفة */
export const isInArchive = (c: Conversation, pref?: ChatPref): boolean =>
  !!pref?.archived && !isDeletedForMe(c, pref);
