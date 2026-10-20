import { db } from '../config/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, limit, onSnapshot,
  serverTimestamp, setDoc, deleteDoc, writeBatch, getCountFromServer,
} from 'firebase/firestore';
import { notify } from './notificationService';

export type FollowState = 'none' | 'requested' | 'following';

const followId = (followerId: string, followingId: string) => `${followerId}_${followingId}`;

// ذاكرة مؤقتة لقائمة الأصدقاء (المتابعة المتبادلة) حتى لا نكرر القراءات
let friendsCache: { uid: string; t: number; ids: string[] } | null = null;
const FRIENDS_TTL_MS = 60 * 1000;
const invalidateFriends = () => {
  friendsCache = null;
};

// هل أتابعه؟ أم أرسلت له طلباً؟
export const getFollowState = async (me: string, target: string): Promise<FollowState> => {
  const f = await getDoc(doc(db, 'follows', followId(me, target)));
  if (f.exists()) return 'following';
  // نستخدم استعلاماً (وليس getDoc) لأن القراءة المباشرة لوثيقة غير موجودة تُرفض بالقواعد
  const q = query(
    collection(db, 'followRequests'),
    where('followerId', '==', me),
    where('followingId', '==', target),
    limit(1)
  );
  const r = await getDocs(q);
  return r.empty ? 'none' : 'requested';
};

export const followUser = async (
  me: string,
  target: string,
  targetAccountType: 'public' | 'private'
): Promise<FollowState> => {
  const id = followId(me, target);
  const data = { followerId: me, followingId: target, createdAt: serverTimestamp() };
  if (targetAccountType === 'private') {
    await setDoc(doc(db, 'followRequests', id), data);
    return 'requested';
  }
  await setDoc(doc(db, 'follows', id), data);
  invalidateFriends();
  return 'following';
};

export const unfollowUser = async (me: string, target: string) => {
  await deleteDoc(doc(db, 'follows', followId(me, target)));
  invalidateFriends();
};

export const cancelRequest = async (me: string, target: string) => {
  await deleteDoc(doc(db, 'followRequests', followId(me, target)));
};

// زر متابعة سريع (يُستعمل في الريلز): يبدّل الحالة ويعيد الحالة الجديدة
export const toggleFollow = async (
  me: string,
  target: string,
  current: FollowState
): Promise<FollowState> => {
  if (current === 'following') {
    await unfollowUser(me, target);
    return 'none';
  }
  if (current === 'requested') {
    await cancelRequest(me, target);
    return 'none';
  }
  const snap = await getDoc(doc(db, 'users', target));
  const type = (snap.data() as { accountType?: string } | undefined)?.accountType === 'private' ? 'private' : 'public';
  const next = await followUser(me, target, type);
  notify(
    target,
    next === 'following' ? 'follow' : 'request',
    next === 'following' ? 'بدأ بمتابعتك' : 'أرسل لك طلب متابعة'
  );
  return next;
};

// قبول طلب (يستدعيها صاحب الحساب الخاص)
export const acceptRequest = async (followerId: string, me: string) => {
  const id = followId(followerId, me);
  const batch = writeBatch(db);
  batch.set(doc(db, 'follows', id), {
    followerId,
    followingId: me,
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(db, 'followRequests', id));
  await batch.commit();
  invalidateFriends();
};

export const rejectRequest = async (followerId: string, me: string) => {
  await deleteDoc(doc(db, 'followRequests', followId(followerId, me)));
};

// الأصدقاء = مستخدمون يتابعون بعضهم تبادلياً
export const getMutualFriendIds = async (me: string): Promise<string[]> => {
  if (friendsCache && friendsCache.uid === me && Date.now() - friendsCache.t < FRIENDS_TTL_MS) {
    return friendsCache.ids;
  }
  const [mineSnap, theirsSnap] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followerId', '==', me), limit(500))),
    getDocs(query(collection(db, 'follows'), where('followingId', '==', me), limit(500))),
  ]);
  const following = new Set(mineSnap.docs.map((d) => d.data().followingId as string));
  const ids = theirsSnap.docs
    .map((d) => d.data().followerId as string)
    .filter((id) => following.has(id));
  friendsCache = { uid: me, t: Date.now(), ids };
  return ids;
};

// حالات متابعتي لجميع الحسابات (متابَع / طلب معلّق) دفعة واحدة
export const getMyFollowStates = async (me: string): Promise<Record<string, FollowState>> => {
  const [fol, req] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followerId', '==', me), limit(500))),
    getDocs(query(collection(db, 'followRequests'), where('followerId', '==', me), limit(200))),
  ]);
  const out: Record<string, FollowState> = {};
  req.docs.forEach((d) => {
    out[d.data().followingId as string] = 'requested';
  });
  fol.docs.forEach((d) => {
    out[d.data().followingId as string] = 'following';
  });
  return out;
};

// العدّادات تُحسب من الوثائق نفسها
export const getFollowCounts = async (uid: string) => {
  const [followers, following, posts] = await Promise.all([
    getCountFromServer(query(collection(db, 'follows'), where('followingId', '==', uid))),
    getCountFromServer(query(collection(db, 'follows'), where('followerId', '==', uid))),
    getCountFromServer(query(collection(db, 'posts'), where('authorId', '==', uid))),
  ]);
  return {
    followers: followers.data().count,
    following: following.data().count,
    posts: posts.data().count,
  };
};

// الطلبات الواردة لحسابي (تتحدث مباشرة)
export const subscribeFollowRequests = (me: string, callback: (followerIds: string[]) => void) => {
  const q = query(collection(db, 'followRequests'), where('followingId', '==', me));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data().followerId as string)),
    (error) => console.error('Follow requests error:', error)
  );
};
