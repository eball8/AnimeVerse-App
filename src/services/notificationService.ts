
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

const MAX_NAME_LENGTH = 50;
const MAX_TEXT_LENGTH = 200;
const MAX_NOTIFICATIONS = 50;

const createNotification = async (
  toUid: string,
  type: NotificationType,
  text: string,
  postId?: string
): Promise<void> => {
  const me = auth.currentUser;

  if (!me || !toUid || !toUid.trim()) {
    return;
  }

  // الإشعارات العادية لا تُرسل إلى صاحب الحساب نفسه.
  // إشعار الجهاز الجديد له دالة مستقلة أدناه.
  if (type !== 'new_device' && me.uid === toUid) {
    return;
  }

  const safeName = (me.displayName || 'مستخدم')
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  const safeText = text.trim().slice(0, MAX_TEXT_LENGTH);

  const data: Record<string, unknown> = {
    toUid,
    fromUid: me.uid,
    fromName: safeName || 'مستخدم',
    type,
    text: safeText,
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
    // لا نوقف العملية الأساسية بسبب فشل إشعار ثانوي.
    console.error('Notification creation failed:', error);
  }
};

/**
 * إنشاء إشعار عادي للمستخدم.
 */
export const notify = async (
  toUid: string,
  type: Exclude<NotificationType, 'new_device'>,
  text: string,
  postId?: string
): Promise<void> => {
  await createNotification(toUid, type, text, postId);
};

/**
 * إشعار أمني عند تسجيل دخول الحساب من جهاز جديد.
 * لا يرسل إشعارًا إذا لم يكن المستخدم الحالي هو صاحب الحساب.
 */
export const notifySecurity = async (
  uid: string,
  event: 'new_device',
  deviceLabel: string
): Promise<void> => {
  const me = auth.currentUser;

  if (!me || me.uid !== uid) {
    return;
  }

  const label = deviceLabel.trim().slice(0, 40) || 'جهاز غير معروف';

  await createNotification(
    uid,
    event,
    `تم تسجيل الدخول إلى حسابك من جهاز جديد: ${label}`,
  );
};

/**
 * الاشتراك في إشعارات المستخدم الحالي.
 */
export const subscribeNotifications = (
  uid: string,
  cb: (items: AppNotification[]) => void
) => {
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) {
    cb([]);
    return () => {};
  }

  const q = query(
    collection(db, 'notifications'),
    where('toUid', '==', uid),
    limit(MAX_NOTIFICATIONS)
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(
        (item) =>
          ({
            id: item.id,
            ...item.data(),
          }) as AppNotification
      );

      const timestamp = (item: AppNotification): number => {
        const value = item.createdAt;

        if (typeof value?.toMillis === 'function') {
          return value.toMillis();
        }

        if (value instanceof Date) {
          return value.getTime();
        }

        return 0;
      };

      items.sort((a, b) => timestamp(b) - timestamp(a));

      cb(items);
    },
    (error) => {
      console.error('Notifications subscription failed:', error);
      cb([]);
    }
  );
};

/**
 * تحديد الإشعارات غير المقروءة كمقروءة.
 */
export const markAllRead = async (
  items: AppNotification[]
): Promise<void> => {
  const me = auth.currentUser;

  if (!me || !items.length) {
    return;
  }

  const unread = items.filter(
    (item) => item.toUid === me.uid && !item.read
  );

  if (!unread.length) {
    return;
  }

  // حد Firestore للعمليات داخل الدفعة الواحدة هو 500.
  // نقسم الدفعات لتجنب تجاوز الحد.
  for (let start = 0; start < unread.length; start += 450) {
    const batch = writeBatch(db);
    const chunk = unread.slice(start, start + 450);

    for (const item of chunk) {
      batch.update(
        doc(db, 'notifications', item.id),
        { read: true }
      );
    }

    await batch.commit();
  }
};
