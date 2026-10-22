import { db } from '../config/firebase';
import {
  collection, serverTimestamp, query, orderBy, onSnapshot, where, limit,
  doc, writeBatch, increment, getDocs, getDoc, setDoc, updateDoc, deleteDoc, startAfter,
  documentId, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { notify } from './notificationService';
import { getMutualFriendIds } from './followService';
import { isValidUsername } from '../utils/username';
import { markPostInteraction } from './storyService'; // ← أضفنا هذا السطر

export interface Post {
  id?: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  repostOfId?: string;
  repostOfAuthorId?: string;
  mentions?: string[];
  /** المدعوون للتعاون في المنشور (حتى MAX_COLLABORATORS، ولا يشمل صاحب المنشور) */
  collaborators?: string[];
  /** من قبِل الدعوة منهم فعلاً (مجموعة جزئية من collaborators) — هؤلاء فقط يظهرون في رأس المنشور */
  collabAccepted?: string[];
  /** السماح للآخرين باستخدام صوت الفيديو / عمل ريمكس (للفيديو فقط) */
  allowAudio?: boolean;
  /** معرّف المنشور الأصلي الذي أُخذ صوته (ريمكس) */
  audioSourceId?: string;
  /** رابط الصوت المستعار (هو رابط فيديو المنشور الأصلي) */
  audioUrl?: string;
  likesCount: number;
  commentsCount: number;
  createdAt: any;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  content: string;
  createdAt: any;
}

/** الحد الأقصى للمدعوين؛ مع صاحب المنشور يصبح المجموع 5 أشخاص */
export const MAX_COLLABORATORS = 4;

/** صاحب المنشور + المساهمون الذين قبلوا الدعوة (بالترتيب، بدون تكرار، حتى 5) */
export const getContributorIds = (post: Pick<Post, 'authorId' | 'collaborators' | 'collabAccepted'>): string[] => {
  const invited = new Set(post.collaborators || []);
  const accepted = (post.collabAccepted || []).filter((id) => invited.has(id) && id !== post.authorId);
  return Array.from(new Set([post.authorId, ...accepted])).slice(0, MAX_COLLABORATORS + 1);
};

/** هل هذا المستخدم مدعوّ للتعاون ولم يقبل بعد؟ */
export const isPendingCollaborator = (
  post: Pick<Post, 'authorId' | 'collaborators' | 'collabAccepted'>,
  uid?: string | null
): boolean =>
  !!uid &&
  uid !== post.authorId &&
  (post.collaborators || []).includes(uid) &&
  !(post.collabAccepted || []).includes(uid);

export const POSTS_CHANGED_EVENT = 'av:posts-changed';

const announcePostsChanged = (uid: string, delta: number): void => {
  try {
    window.dispatchEvent(new CustomEvent(POSTS_CHANGED_EVENT, { detail: { uid, delta } }));
  } catch {
    // لا يؤثر على عمل التطبيق
  }
};

let shareLikesWithFriends = true;
export const setShareLikesWithFriends = (v: boolean): void => {
  shareLikesWithFriends = v;
};

const extractMentionIds = async (content: string, authorId: string): Promise<string[]> => {
  const names = new Set<string>();
  const re = /(^|\s)@([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[2].toLowerCase();
    if (!isValidUsername(name)) continue;
    names.add(name);
    if (names.size >= 10) break;
  }
  if (names.size === 0) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('username', 'in', Array.from(names))));
    return snap.docs.map((d) => d.id).filter((id) => id !== authorId);
  } catch (e) {
    console.error('mentions lookup failed:', e);
    return [];
  }
};

export const createPost = async (
  postData: Omit<Post, 'id' | 'createdAt' | 'likesCount' | 'commentsCount' | 'mentions'>
) => {
  try {
    const isRepost = !!postData.repostOfId;

    const clean = Object.fromEntries(
      Object.entries(postData).filter(([, v]) => v !== undefined && v !== '')
    ) as Record<string, unknown>;
    delete clean.collaborators;
    delete clean.collabAccepted;

    // المنشور التعاوني: حتى 4 مدعوين + صاحب المنشور = 5 أشخاص كحد أقصى
    const collab = Array.from(new Set(postData.collaborators || []))
      .filter((id) => id && id !== postData.authorId)
      .slice(0, MAX_COLLABORATORS);
    const mentionIds = await extractMentionIds(postData.content ?? '', postData.authorId);
    const allMentions = mentionIds.slice(0, 20);

    const payload: Record<string, unknown> = {
      ...clean,
      content: postData.content ?? '',
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
    };
    if (allMentions.length) payload.mentions = allMentions;
    if (collab.length) payload.collaborators = collab;

    const newRef = doc(collection(db, 'posts'));
    try {
      const batch = writeBatch(db);
      batch.set(newRef, payload);
      if (!isRepost) {
        batch.update(doc(db, 'users', postData.authorId), { postsCount: increment(1) });
      }
      await batch.commit();
    } catch (e: any) {
      if (e?.code !== 'permission-denied') throw e;
      await setDoc(newRef, payload);
    }
    if (!isRepost) announcePostsChanged(postData.authorId, 1);

    mentionIds.forEach((uid) => notify(uid, 'comment', 'أشار إليك في منشور', newRef.id));
    collab.forEach((uid) => notify(uid, 'comment', 'شاركك في منشور تعاوني', newRef.id));

    return newRef.id;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
};

export const repostPost = async (
  original: Post,
  me: { uid: string; displayName: string; photoURL?: string }
): Promise<string> => {
  if (!original.id || !original.mediaUrl) throw new Error('NOTHING_TO_REPOST');
  const id = await createPost({
    authorId: me.uid,
    authorName: me.displayName,
    authorPhotoURL: me.photoURL,
    content: '',
    mediaUrl: original.mediaUrl,
    mediaType: original.mediaType,
    repostOfId: original.repostOfId || original.id,
    repostOfAuthorId: original.repostOfAuthorId || original.authorId,
  });
  // تسجيل التفاعل لإظهار القصص
  markPostInteraction(original.authorId);
  notify(original.authorId, 'like', 'أعاد نشر منشورك', original.id);
  return id;
};

export const getMyRepostMap = async (uid: string): Promise<Record<string, string>> => {
  const snap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), limit(300)));
  const out: Record<string, string> = {};
  snap.docs.forEach((d) => {
    const x = d.data() as { repostOfId?: string };
    if (x.repostOfId) out[x.repostOfId] = d.id;
  });
  return out;
};

export const subscribeToPosts = (callback: (posts: Post[]) => void, max = 20) => {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snapshot) => {
    const posts: Post[] = [];
    snapshot.forEach((d) => posts.push({ id: d.id, ...d.data() } as Post));
    callback(posts);
  }, (error) => console.error('Error fetching posts:', error));
};

export const getPostById = async (id: string): Promise<Post | null> => {
  const snap = await getDoc(doc(db, 'posts', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Post) : null;
};

export interface ReelsPage {
  items: Post[];
  cursor: QueryDocumentSnapshot | null;
  done: boolean;
}

export const getReelsPage = async (cursor: QueryDocumentSnapshot | null, size = 8): Promise<ReelsPage> => {
  try {
    const constraints: QueryConstraint[] = [where('mediaType', '==', 'video'), orderBy('createdAt', 'desc')];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(size));
    const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
    return {
      items: snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post)),
      cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : cursor,
      done: snap.docs.length < size,
    };
  } catch (e: any) {
    if (e?.code !== 'failed-precondition') throw e;
    console.error('Reels index is missing. Open the link inside this error to create it:', e);
    if (cursor) return { items: [], cursor, done: true };
    const snap = await getDocs(query(collection(db, 'posts'), where('mediaType', '==', 'video'), limit(30)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
    const ms = (p: Post) => p.createdAt?.toMillis?.() ?? 0;
    items.sort((a, b) => ms(b) - ms(a));
    return { items, cursor: null, done: true };
  }
};

export interface FriendReel {
  post: Post;
  likedBy: string[];
}

export const getFriendsReels = async (me: string, max = 40): Promise<FriendReel[]> => {
  const friends = await getMutualFriendIds(me);
  if (!friends.length) return [];
  const friendSet = new Set(friends);

  const snap = await getDocs(
    query(collection(db, 'friendActivity'), where('audience', 'array-contains', me), limit(120))
  );
  const acts = snap.docs
    .map((d) => d.data() as { userId: string; postId: string; createdAt?: any })
    .filter((a) => !!a.postId && friendSet.has(a.userId));
  acts.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  const order: string[] = [];
  const likers = new Map<string, string[]>();
  for (const a of acts) {
    if (!likers.has(a.postId)) {
      likers.set(a.postId, []);
      order.push(a.postId);
    }
    likers.get(a.postId)!.push(a.userId);
  }

  const ids = order.slice(0, max);
  const posts = new Map<string, Post>();
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const ps = await getDocs(query(collection(db, 'posts'), where(documentId(), 'in', chunk)));
    ps.forEach((d) => posts.set(d.id, { id: d.id, ...d.data() } as Post));
  }

  return ids
    .filter((id) => posts.get(id)?.mediaType === 'video' && !!posts.get(id)?.mediaUrl)
    .map((id) => ({ post: posts.get(id)!, likedBy: likers.get(id) || [] }));
};

export const clearMyFriendActivity = async (uid: string): Promise<void> => {
  const snap = await getDocs(query(collection(db, 'friendActivity'), where('userId', '==', uid), limit(500)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
};

const createdMs = (p: Post) => p.createdAt?.toMillis?.() ?? 0;

export const getUserPosts = async (uid: string, max = 100): Promise<Post[]> => {
  // منشورات تعاونية قبل المستخدم دعوتها (تظهر في ملفه الشخصي مثل إنستغرام)
  const collabPosts = getCollabPosts(uid, max).catch((e) => {
    console.error('collab posts failed:', e);
    return [] as Post[];
  });
  const merge = async (own: Post[]): Promise<Post[]> => {
    const extra = await collabPosts;
    if (!extra.length) return own;
    const seen = new Set(own.map((p) => p.id));
    const all = [...own, ...extra.filter((p) => !seen.has(p.id))];
    all.sort((a, b) => createdMs(b) - createdMs(a));
    return all;
  };
  try {
    const snap = await getDocs(
      query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('createdAt', 'desc'), limit(max))
    );
    return merge(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post)));
  } catch (e: any) {
    if (e?.code !== 'failed-precondition') throw e;
    console.error('User posts index is missing. Open the link inside this error to create it:', e);
    const snap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), limit(max)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
    items.sort((a, b) => createdMs(b) - createdMs(a));
    return merge(items);
  }
};

/** المنشورات التي قبل فيها هذا المستخدم دعوة التعاون (لا تحتاج فهرساً مركباً) */
export const getCollabPosts = async (uid: string, max = 100): Promise<Post[]> => {
  const snap = await getDocs(query(collection(db, 'posts'), where('collabAccepted', 'array-contains', uid), limit(max)));
  const items = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Post))
    .filter((p) => p.authorId !== uid && (p.collaborators || []).includes(uid));
  items.sort((a, b) => createdMs(b) - createdMs(a));
  return items;
};

/** قبول دعوة التعاون (accept=true) أو رفضها/الانسحاب منها (accept=false) */
export const respondToCollabInvite = async (post: Post, uid: string, accept: boolean): Promise<void> => {
  if (!post.id) return;
  const ref = doc(db, 'posts', post.id);
  if (accept) {
    await updateDoc(ref, { collabAccepted: arrayUnion(uid) });
    notify(post.authorId, 'comment', 'قبل دعوتك للتعاون في منشور', post.id);
  } else {
    await updateDoc(ref, { collaborators: arrayRemove(uid), collabAccepted: arrayRemove(uid) });
  }
};

export const getMentionedPosts = async (uid: string, max = 100): Promise<Post[]> => {
  const snap = await getDocs(query(collection(db, 'posts'), where('mentions', 'array-contains', uid), limit(max)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
  items.sort((a, b) => createdMs(b) - createdMs(a));
  return items;
};

export const deletePost = async (postId: string): Promise<void> => {
  const ref = doc(db, 'posts', postId);
  let authorId: string | undefined;
  let isRepost = false;
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as { authorId?: string; repostOfId?: string };
    authorId = data.authorId;
    isRepost = !!data.repostOfId;
  } catch (e) {
    console.error('delete: read failed', e);
  }

  try {
    const batch = writeBatch(db);
    batch.delete(ref);
    if (authorId && !isRepost) {
      batch.update(doc(db, 'users', authorId), { postsCount: increment(-1) });
    }
    await batch.commit();
  } catch (e: any) {
    if (e?.code !== 'permission-denied') throw e;
    await deleteDoc(ref);
  }
  if (authorId && !isRepost) announcePostsChanged(authorId, -1);
};

export const reconcilePostsCount = async (uid: string): Promise<number> => {
  const snap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), limit(2000)));
  const actual = snap.docs.filter((d) => !(d.data() as { repostOfId?: string }).repostOfId).length;
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const stored = (userSnap.data() as { postsCount?: number } | undefined)?.postsCount;
    if (stored !== actual) await updateDoc(doc(db, 'users', uid), { postsCount: actual });
  } catch (e) {
    console.error('postsCount reconcile failed:', e);
  }
  return actual;
};

export const getMyLikedPostIds = async (uid: string): Promise<Set<string>> => {
  const snap = await getDocs(query(collection(db, 'likes'), where('userId', '==', uid), limit(500)));
  return new Set(snap.docs.map((d) => d.data().postId as string));
};

export const toggleLike = async (post: Post, uid: string, liked: boolean): Promise<void> => {
  if (!post.id) return;
  const likeRef = doc(db, 'likes', `${post.id}_${uid}`);
  const postRef = doc(db, 'posts', post.id);
  const isReel = post.mediaType === 'video';
  const actRef = doc(db, 'friendActivity', `${post.id}_${uid}`);

  let audience: string[] = [];
  if (isReel && !liked && shareLikesWithFriends) {
    audience = await getMutualFriendIds(uid).catch(() => [] as string[]);
  }

  const run = async (withActivity: boolean) => {
    const batch = writeBatch(db);
    if (liked) {
      batch.delete(likeRef);
      batch.update(postRef, { likesCount: increment(-1) });
      if (withActivity) batch.delete(actRef);
    } else {
      batch.set(likeRef, { postId: post.id, userId: uid, createdAt: serverTimestamp() });
      batch.update(postRef, { likesCount: increment(1) });
      if (withActivity && audience.length) {
        batch.set(actRef, { userId: uid, postId: post.id, audience, createdAt: serverTimestamp() });
      }
    }
    await batch.commit();
  };

  try {
    await run(isReel);
  } catch (e: any) {
    if (isReel && e?.code === 'permission-denied') await run(false);
    else throw e;
  }
  
  if (!liked) {
    markPostInteraction(post.authorId); // ← تسجيل التفاعل
    notify(post.authorId, 'like', 'أعجب بمنشورك', post.id);
  }
};

export const subscribeComments = (postId: string, cb: (c: PostComment[]) => void) => {
  const q = query(collection(db, 'comments'), where('postId', '==', postId), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PostComment));
      const t = (c: PostComment) => c.createdAt?.toMillis?.() ?? Date.now();
      items.sort((a, b) => t(a) - t(b));
      cb(items);
    },
    (e) => console.error('comments error:', e)
  );
};

export const addComment = async (
  post: Post,
  author: { uid: string; displayName: string; photoURL?: string },
  text: string
): Promise<void> => {
  if (!post.id) return;
  const content = text.trim().slice(0, 500);
  if (!content) return;
  const data: Record<string, unknown> = {
    postId: post.id,
    authorId: author.uid,
    authorName: author.displayName.slice(0, 50),
    content,
    createdAt: serverTimestamp(),
  };
  if (author.photoURL) data.authorPhotoURL = author.photoURL;

  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'comments')), data);
  batch.update(doc(db, 'posts', post.id), { commentsCount: increment(1) });
  await batch.commit();
  
  markPostInteraction(post.authorId); // ← تسجيل التفاعل
  notify(post.authorId, 'comment', `علّق على منشورك: ${content.slice(0, 60)}`, post.id);
};

export const deleteComment = async (c: PostComment): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'comments', c.id));
  batch.update(doc(db, 'posts', c.postId), { commentsCount: increment(-1) });
  await batch.commit();
};
