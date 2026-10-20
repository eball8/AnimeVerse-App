import { db } from '../config/firebase';
import {
  collection, serverTimestamp, query, orderBy, onSnapshot, where, limit,
  doc, writeBatch, increment, getDocs, getDoc, setDoc, updateDoc, deleteDoc, startAfter,
  documentId, getCountFromServer,
} from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { notify } from './notificationService';
import { getMutualFriendIds } from './followService';

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
  collaborators?: string[];
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

// ---------------------------------------------------------------
// حدث داخلي: عدد منشورات مستخدم تغيّر (نشر/حذف). الصفحات المفتوحة تستمع له
// لتحدّث العدّاد فوراً بدون إعادة فتحها.
// ---------------------------------------------------------------
export const POSTS_CHANGED_EVENT = 'av:posts-changed';

const announcePostsChanged = (uid: string, delta: number): void => {
  try {
    window.dispatchEvent(new CustomEvent(POSTS_CHANGED_EVENT, { detail: { uid, delta } }));
  } catch {
    // لا يؤثر على عمل التطبيق
  }
};

// هل أسمح للأصدقاء برؤية الريلز التي أعجبتني؟ (يُضبط من Layout حسب إعداد الحساب)
let shareLikesWithFriends = true;
export const setShareLikesWithFriends = (v: boolean): void => {
  shareLikesWithFriends = v;
};

// استخراج @username من نص المنشور وتحويلها إلى معرّفات مستخدمين حقيقيين (حد أقصى 10)
const extractMentionIds = async (content: string, authorId: string): Promise<string[]> => {
  const names = new Set<string>();
  const re = /(^|\s)@([a-zA-Z0-9_]{3,30})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    names.add(m[2].toLowerCase());
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
    // Firestore يرفض القيم undefined، فنحذف الحقول الفارغة قبل الإرسال
    const clean = Object.fromEntries(
      Object.entries(postData).filter(([, v]) => v !== undefined && v !== '')
    ) as Record<string, unknown>;
    delete clean.collaborators;

    const collab = Array.from(new Set(postData.collaborators || []))
      .filter((id) => id && id !== postData.authorId)
      .slice(0, 10);
    const mentionIds = await extractMentionIds(postData.content ?? '', postData.authorId);
    const allMentions = Array.from(new Set([...mentionIds, ...collab])).slice(0, 20);

    const payload: Record<string, unknown> = {
      ...clean,
      content: postData.content ?? '',
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
    };
    if (allMentions.length) payload.mentions = allMentions;
    if (collab.length) payload.collaborators = collab;

    // نشر المنشور + زيادة عدّاد المستخدم في عملية واحدة (Atomic)
    const newRef = doc(collection(db, 'posts'));
    try {
      const batch = writeBatch(db);
      batch.set(newRef, payload);
      batch.update(doc(db, 'users', postData.authorId), { postsCount: increment(1) });
      await batch.commit();
    } catch (e: any) {
      if (e?.code !== 'permission-denied') throw e;
      // قواعد Firestore الجديدة لم تُنشر بعد: ننشر المنشور بدون تحديث العدّاد
      await setDoc(newRef, payload);
    }
    announcePostsChanged(postData.authorId, 1);

    // إشعار كل شخص تمت الإشارة إليه أو إضافته كمتعاون
    mentionIds.forEach((uid) => notify(uid, 'comment', 'أشار إليك في منشور', newRef.id));
    collab.forEach((uid) => notify(uid, 'comment', 'شاركك في منشور تعاوني', newRef.id));

    return newRef.id;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
};

// إعادة نشر فيديو/صورة في ملفي (تشير للمنشور الأصلي). تعيد معرّف منشور إعادة النشر.
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
  notify(original.authorId, 'like', 'أعاد نشر منشورك', original.id);
  return id;
};

// خريطة: معرّف المنشور الأصلي -> معرّف منشور إعادة النشر الخاص بي (لزر التبديل)
export const getMyRepostMap = async (uid: string): Promise<Record<string, string>> => {
  const snap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), limit(300)));
  const out: Record<string, string> = {};
  snap.docs.forEach((d) => {
    const x = d.data() as { repostOfId?: string };
    if (x.repostOfId) out[x.repostOfId] = d.id;
  });
  return out;
};

// آخر منشورات المجتمع (بحد أقصى لتوفير القراءات)
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

// خلاصة الريلز: الفيديوهات فقط، صفحة صغيرة في كل مرة
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
    // الفهرس المركّب غير منشأ بعد: افتح الرابط الظاهر في هذا الخطأ داخل Console ثم اضغط Create
    console.error('Reels index is missing. Open the link inside this error to create it:', e);
    if (cursor) return { items: [], cursor, done: true };
    const snap = await getDocs(query(collection(db, 'posts'), where('mediaType', '==', 'video'), limit(30)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
    const ms = (p: Post) => p.createdAt?.toMillis?.() ?? 0;
    items.sort((a, b) => ms(b) - ms(a));
    return { items, cursor: null, done: true };
  }
};

// ---------------------------------------------------------------
// تبويب Friends: ريلز أعجبت أصدقائي (المتابعة المتبادلة) وسمحوا بإظهارها
// ---------------------------------------------------------------
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

// حذف كل إعجاباتي المنشورة للأصدقاء (عند إيقاف "إظهار الإعجابات للأصدقاء")
export const clearMyFriendActivity = async (uid: string): Promise<void> => {
  const snap = await getDocs(query(collection(db, 'friendActivity'), where('userId', '==', uid), limit(500)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
};

const createdMs = (p: Post) => p.createdAt?.toMillis?.() ?? 0;

// منشورات مستخدم معيّن (الأحدث أولاً). إن لم يُنشأ الفهرس المركّب نرتّب محلياً.
export const getUserPosts = async (uid: string, max = 100): Promise<Post[]> => {
  try {
    const snap = await getDocs(
      query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('createdAt', 'desc'), limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
  } catch (e: any) {
    if (e?.code !== 'failed-precondition') throw e;
    console.error('User posts index is missing. Open the link inside this error to create it:', e);
    const snap = await getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), limit(max)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
    items.sort((a, b) => createdMs(b) - createdMs(a));
    return items;
  }
};

// المنشورات التي تمت الإشارة إلى هذا المستخدم فيها (@mention) أو أُضيف فيها كمتعاون
export const getMentionedPosts = async (uid: string, max = 100): Promise<Post[]> => {
  const snap = await getDocs(query(collection(db, 'posts'), where('mentions', 'array-contains', uid), limit(max)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
  items.sort((a, b) => createdMs(b) - createdMs(a));
  return items;
};

// حذف منشور/ريلز + إنقاص عدّاد صاحبه في عملية واحدة (Atomic Decrement)
export const deletePost = async (postId: string): Promise<void> => {
  const ref = doc(db, 'posts', postId);
  let authorId: string | undefined;
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    authorId = (snap.data() as { authorId?: string }).authorId;
  } catch (e) {
    console.error('delete: read failed', e);
  }

  try {
    const batch = writeBatch(db);
    batch.delete(ref);
    if (authorId) batch.update(doc(db, 'users', authorId), { postsCount: increment(-1) });
    await batch.commit();
  } catch (e: any) {
    if (e?.code !== 'permission-denied') throw e;
    // العدّاد وصل 0 أو القواعد الجديدة غير منشورة: نحذف المنشور وحده
    await deleteDoc(ref);
  }
  if (authorId) announcePostsChanged(authorId, -1);
};

// مزامنة العدّاد المخزّن مع العدد الفعلي (تصحيح الأرقام القديمة غير المتطابقة)
export const reconcilePostsCount = async (uid: string): Promise<number> => {
  const actual = (
    await getCountFromServer(query(collection(db, 'posts'), where('authorId', '==', uid)))
  ).data().count;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const stored = (snap.data() as { postsCount?: number } | undefined)?.postsCount;
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

  // الجمهور: أصدقائي (متابعة متبادلة) فقط، وفقط إذا فعّلت "إظهار الإعجابات للأصدقاء"
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
    // قواعد friendActivity غير منشورة بعد: نعيد المحاولة بدونها حتى يعمل الإعجاب
    if (isReel && e?.code === 'permission-denied') await run(false);
    else throw e;
  }
  if (!liked) notify(post.authorId, 'like', 'أعجب بمنشورك', post.id);
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
  notify(post.authorId, 'comment', `علّق على منشورك: ${content.slice(0, 60)}`, post.id);
};

export const deleteComment = async (c: PostComment): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'comments', c.id));
  batch.update(doc(db, 'posts', c.postId), { commentsCount: increment(-1) });
  await batch.commit();
};
