
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { auth, db } from '../config/firebase';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'request'
  | 'new_device';

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

/**
 * إرسال إشعار عادي إلى مستخدم آخر.
 */
export const notify = async (
  toUid: string,
  type: Exclude<NotificationType, 'new_device'>,
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

  if (me.photoURL) {
    data.fromPhotoURL = me.photoURL;
  }

  if (postId) {
    data.postId = postId;
  }

  try {
    await addDoc(collection(db, 'notifications'), data);
  } catch (error) {
    console.error('notify failed:', error);
  }
};

/**
 * إنشاء إشعار أمني للمستخدم نفسه عند اكتشاف جهاز جديد.
 * لا تُرسل بيانات حساسة عن الجهاز داخل الإشعار.
 */
export const notifySecurity = async (
  uid: string,
  type: 'new_device',
  deviceName: string
): Promise<void> => {
  const me = auth.currentUser;

  // لا تسمح بإنشاء إشعار أمني لحساب آخر.
  if (!me || me.uid !== uid) return;

  const safeDeviceName = deviceName.trim().slice(0, 60) || 'جهاز غير معروف';

  const data: Record<string, unknown> = {
    toUid: uid,
    fromUid: uid,
    fromName: (me.displayName || 'مستخدم').slice(0, 50),
    type,
    text: `تم تسجيل الدخول من جهاز جديد: ${safeDeviceName}`,
    read: false,
    createdAt: serverTimestamp(),
  };

  if (me.photoURL) {
    data.fromPhotoURL = me.photoURL;
  }

  try {
    await addDoc(collection(db, 'notifications'), data);
  } catch (error) {
    console.error('notifySecurity failed:', error);
  }
};

/**
 * الاشتراك في إشعارات المستخدم.
 * يجلب آخر 50 إشعارًا ويرتبها من الأحدث إلى الأقدم.
 */
export const subscribeNotifications = (
  uid: string,
  cb: (items: AppNotification[]) => void
) => {
  const q = query(
    collection(db, 'notifications'),
    where('toUid', '==', uid),
    limit(50)
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as AppNotification
      );

      const timestamp = (item: AppNotification): number =>
        item.createdAt?.toMillis?.() ?? 0;

      items.sort((a, b) => timestamp(b) - timestamp(a));
      cb(items);
    },
    (error) => {
      console.error('notifications error:', error);
    }
  );
};

/**
 * وضع علامة "مقروء" على جميع الإشعارات غير المقروءة.
 */
export const markAllRead = async (
  items: AppNotification[]
): Promise<void> => {
  const unread = items.filter((item) => !item.read);

  if (unread.length === 0) return;

  const batch = writeBatch(db);

  unread.forEach((item) => {
    batch.update(doc(db, 'notifications', item.id), {
      read: true,
    });
  });

  await batch.commit();
};
