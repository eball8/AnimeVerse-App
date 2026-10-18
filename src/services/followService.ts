import { db } from '../config/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, limit, onSnapshot,
  serverTimestamp, setDoc, deleteDoc, writeBatch, getCountFromServer,
} from 'firebase/firestore';

export type FollowState = 'none' | 'requested' | 'following';

const followId = (followerId: string, followingId: string) => `${followerId}_${followingId}`;

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
  return 'following';
};

export const unfollowUser = async (me: string, target: string) => {
  await deleteDoc(doc(db, 'follows', followId(me, target)));
};

export const cancelRequest = async (me: string, target: string) => {
  await deleteDoc(doc(db, 'followRequests', followId(me, target)));
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
};

export const rejectRequest = async (followerId: string, me: string) => {
  await deleteDoc(doc(db, 'followRequests', followId(followerId, me)));
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
