import {
  addDoc, collection, doc, limit, onSnapshot, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export type NotificationType = 'like' | 'comment' | 'follow' | 'request';

export interface AppNotification {
  id: string;
  toUid: string;
  fromUid: string;
  fromName: string;
  fromPhotoURL?: string;
  type: NotificationType;
  postId?: string;
  text: string;
  read: boolean;
  createdAt: any;
}

export const notify = async (
  toUid: string,
  type: NotificationType,
  text: string,
  postId?: string
): Promise<void> => {
  const me = auth.currentUser;
  if (!me || me.uid === toUid) return;
  const data: Record<string, unknown> = {
    toUid,
    fromUid: me.uid,
    fromName: (me.displayName || 'مستخدم').slice(0, 50),
    type,
    text: text.slice(0, 200),
    read: false,
    createdAt: serverTimestamp(),
  };
  if (me.photoURL) data.fromPhotoURL = me.photoURL;
  if (postId) data.postId = postId;
  try {
    await addDoc(collection(db, 'notifications'), data);
  } catch (e) {
    console.error('notify failed:', e);
  }
};

export const subscribeNotifications = (uid: string, cb: (items: AppNotification[]) => void) => {
  // بدون orderBy لتجنّب إنشاء فهرس مركّب، والترتيب يتم هنا
  const q = query(collection(db, 'notifications'), where('toUid', '==', uid), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
      const t = (n: AppNotification) => n.createdAt?.toMillis?.() ?? Date.now();
      items.sort((a, b) => t(b) - t(a));
      cb(items);
    },
    (e) => console.error('notifications error:', e)
  );
};

export const markAllRead = async (items: AppNotification[]) => {
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
  await batch.commit();
};
