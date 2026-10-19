
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { auth, db } from '../config/firebase';
import { notifySecurity } from './notificationService';

const DEVICE_ID_KEY = 'av_device_id';
const DEVICE_CHECK_PREFIX = 'av_dev_ok_';

const checkedKey = (uid: string): string =>
  `${DEVICE_CHECK_PREFIX}${uid}`;

const randomId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    return Array.from(
      crypto.getRandomValues(new Uint8Array(16))
    )
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  throw new Error('Secure random ID generation is unavailable');
};

/**
 * الحصول على معرّف ثابت للجهاز داخل تخزين المتصفح.
 * قد يتغير المعرّف بعد مسح بيانات التطبيق أو إعادة تثبيته.
 */
export const getDeviceId = (): string => {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);

    if (existing && existing !== 'unknown') {
      return existing;
    }

    const id = randomId();
    localStorage.setItem(DEVICE_ID_KEY, id);

    return id;
  } catch (error) {
    console.warn('Unable to persist device ID:', error);
    return 'unknown';
  }
};

/**
 * اسم مختصر للجهاز، دون تخزين معلومات غير ضرورية.
 */
export const deviceLabel = (): string => {
  const ua =
    typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  const androidMatch = ua.match(
    /Android [\d.]+;\s*([^;)]+?)(?: Build|\)|;)/
  );

  if (androidMatch) {
    const model = androidMatch[1].trim();

    if (model.length > 1 && model !== 'K') {
      return model.slice(0, 40);
    }

    return 'Android';
  }

  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'iOS';
  }

  return 'Web';
};

const getPlatform = (): 'android' | 'web' => {
  const ua =
    typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  return /Android/i.test(ua) ? 'android' : 'web';
};

/**
 * التحقق من الجهاز بعد نجاح تسجيل الدخول.
 *
 * أول جهاز يُسجّل دون إشعار.
 * الجهاز الجديد يُسجّل ثم يُرسل إشعار أمان.
 */
export const checkDevice = async (
  uid: string
): Promise<void> => {
  const currentUser = auth.currentUser;

  // لا نسمح بتسجيل جهاز لحساب غير المستخدم المسجل دخوله.
  if (!currentUser || currentUser.uid !== uid) {
    return;
  }

  const id = getDeviceId();

  if (id === 'unknown') {
    console.warn('Device check skipped: no persistent device ID');
    return;
  }

  const key = checkedKey(uid);

  try {
    if (localStorage.getItem(key) === id) {
      return;
    }
  } catch {
    // نتابع التحقق من Firestore إذا تعذر استخدام localStorage.
  }

  const deviceRef = doc(
    db,
    'userDevices',
    uid,
    'items',
    id
  );

  try {
    const deviceSnapshot = await getDoc(deviceRef);

    // ربما تغيّر الحساب أثناء تنفيذ العملية.
    if (auth.currentUser?.uid !== uid) {
      return;
    }

    if (deviceSnapshot.exists()) {
      try {
        localStorage.setItem(key, id);
      } catch {
        // عدم توفر التخزين المحلي لا يمنع إكمال العملية.
      }

      return;
    }

    const devicesQuery = query(
      collection(db, 'userDevices', uid, 'items'),
      limit(1)
    );

    const otherDevicesSnapshot = await getDocs(devicesQuery);

    if (auth.currentUser?.uid !== uid) {
      return;
    }

    const isNewDevice = !otherDevicesSnapshot.empty;
    const label = deviceLabel();

    await setDoc(deviceRef, {
      label,
      platform: getPlatform(),
      createdAt: serverTimestamp(),
    });

    try {
      localStorage.setItem(key, id);
    } catch {
      // سيُعاد التحقق عبر Firestore في المرة القادمة.
    }

    if (isNewDevice && auth.currentUser?.uid === uid) {
      await notifySecurity(uid, 'new_device', label);
    }
  } catch (error) {
    // لا نوقف تسجيل الدخول إذا فشل التحقق من الجهاز.
    console.error('Device security check failed:', error);
  }
};
