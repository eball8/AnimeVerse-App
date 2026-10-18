import { db } from '../config/firebase';
import {
  collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, limit,
  doc, writeBatch, increment, getDocs, getDoc, deleteDoc, startAfter,
} from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { notify } from './notificationService';

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

export const createPost = async (postData: Omit<Post, 'id' | 'createdAt' | 'likesCount' | 'commentsCount'>) => {
  try {
    // Firestore يرفض القيم undefined، فنحذف الحقول الفارغة قبل الإرسال
    const clean = Object.fromEntries(
      Object.entries(postData).filter(([, v]) => v !== undefined && v !== '')
    ) as typeof postData;
    const docRef = await addDoc(collection(db, 'posts'), {
      ...clean,
      content: postData.content ?? '',
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
};

// إعادة نشر فيديو/صورة في ملفي (تشير للمنشور الأصلي)
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

export const deletePost = async (postId: string) => {
  await deleteDoc(doc(db, 'posts', postId));
};

export const getMyLikedPostIds = async (uid: string): Promise<Set<string>> => {
  const snap = await getDocs(query(collection(db, 'likes'), where('userId', '==', uid), limit(500)));
  return new Set(snap.docs.map((d) => d.data().postId as string));
};

export const toggleLike = async (post: Post, uid: string, liked: boolean): Promise<void> => {
  if (!post.id) return;
  const likeRef = doc(db, 'likes', `${post.id}_${uid}`);
  const postRef = doc(db, 'posts', post.id);
  const batch = writeBatch(db);
  if (liked) {
    batch.delete(likeRef);
    batch.update(postRef, { likesCount: increment(-1) });
  } else {
    batch.set(likeRef, { postId: post.id, userId: uid, createdAt: serverTimestamp() });
    batch.update(postRef, { likesCount: increment(1) });
  }
  await batch.commit();
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
