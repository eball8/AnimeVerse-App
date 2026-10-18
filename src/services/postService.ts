import { db } from '../config/firebase';
import {
  collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, limit,
  doc, writeBatch, increment, getDocs, deleteDoc,
} from 'firebase/firestore';
import { notify } from './notificationService';

export interface Post {
  id?: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
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

export const subscribeToPosts = (callback: (posts: Post[]) => void) => {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const posts: Post[] = [];
    snapshot.forEach((d) => posts.push({ id: d.id, ...d.data() } as Post));
    callback(posts);
  }, (error) => console.error('Error fetching posts:', error));
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
