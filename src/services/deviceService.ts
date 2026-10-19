
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
    const bytes = crypto.getRandomValues(new Uint8Array(16));

    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  throw new Error('Secure random ID generation is unavailable');
};

/**
 * إنشاء معرّف ثابت نسبيًا للجهاز داخل تخزين التطبيق.
 * قد يتغير عند مسح بيانات التطبيق أو إعادة تثبيته.
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
  } catch {
    return 'unknown';
  }
};

/**
 * الحصول على اسم مختصر للجهاز دون جمع معلومات إضافية.
 */
export const deviceLabel = (): string => {
  const userAgent =
    typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  const androidMatch = userAgent.match(
    /Android [\d.]+;\s*([^;)]+?)(?: Build|\)|;)/
  );

  if (androidMatch) {
    const model = androidMatch[1].trim();

    if (model.length > 1 && model !== 'K') {
      return model.slice(0, 40);
    }

    return 'Android';
  }

  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'iOS';
  }

  return 'Web';
};

const getPlatform = (): 'android' | 'web' => {
  const userAgent =
    typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  return /Android/i.test(userAgent) ? 'android' : 'web';
};

/**
 * التحقق من الجهاز بعد نجاح تسجيل الدخول.
 *
 * الجهاز الأول يُسجّل دون إشعار.
 * الجهاز الجديد يُسجّل ويُرسل إشعارًا أمنيًا.
 */
export const checkDevice = async (
  uid: string
): Promise<void> => {
  const currentUser = auth.currentUser;

  if (!currentUser || currentUser.uid !== uid) {
    return;
  }

  const deviceId = getDeviceId();

  if (deviceId === 'unknown') {
    console.warn(
      'Device verification skipped: persistent storage unavailable.'
    );
    return;
  }

  const localKey = checkedKey(uid);

  try {
    if (localStorage.getItem(localKey) === deviceId) {
      return;
    }
  } catch {
    // نتابع التحقق من Firestore عند تعذر التخزين المحلي.
  }

  const deviceRef = doc(
    db,
    'userDevices',
    uid,
    'items',
    deviceId
  );

  try {
    const existingDevice = await getDoc(deviceRef);

    if (auth.currentUser?.uid !== uid) {
      return;
    }

    if (existingDevice.exists()) {
      try {
        localStorage.setItem(localKey, deviceId);
      } catch {
        // التخزين المحلي ليس شرطًا لنجاح التحقق.
      }

      return;
    }

    const devicesQuery = query(
      collection(db, 'userDevices', uid, 'items'),
      limit(1)
    );

    const otherDevices = await getDocs(devicesQuery);

    if (auth.currentUser?.uid !== uid) {
      return;
    }

    const isNewDevice = !otherDevices.empty;
    const label = deviceLabel();

    await setDoc(deviceRef, {
      label,
      platform: getPlatform(),
      createdAt: serverTimestamp(),
    });

    if (auth.currentUser?.uid !== uid) {
      return;
    }

    try {
      localStorage.setItem(localKey, deviceId);
    } catch {
      // يمكن إعادة التحقق من Firestore لاحقًا.
    }

    if (isNewDevice) {
      await notifySecurity(uid, 'new_device', label);
    }
  } catch (error) {
    // فشل التحقق لا يمنع تسجيل الدخول إلى التطبيق.
    console.error('Device verification failed:', error);
  }
};
