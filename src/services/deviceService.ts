import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { notifySecurity } from './notificationService';

const DEVICE_ID_KEY = 'av_device_id';
const checkedKey = (uid: string) => `av_dev_ok_${uid}`;

const randomId = (): string => {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// المعرّف يُحفظ في تخزين التطبيق: يُفقد مع مسح البيانات/إعادة التثبيت/فرمتة الهاتف/جهاز جديد
export const getDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
};

export const deviceLabel = (): string => {
  const ua = navigator.userAgent || '';
  const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\)|;)/);
  if (m) {
    const model = m[1].trim();
    if (model.length > 1 && model !== 'K') return model.slice(0, 40);
    return 'Android';
  }
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  return 'Web';
};

// يُستدعى بعد تسجيل الدخول: أول جهاز يُسجَّل بصمت، وأي جهاز جديد بعده يُنبّه صاحب الحساب
export const checkDevice = async (uid: string): Promise<void> => {
  const id = getDeviceId();
  if (id === 'unknown') return;
  try {
    if (localStorage.getItem(checkedKey(uid)) === id) return; // تم التحقق سابقاً بدون أي قراءة
  } catch {
    /* ignore */
  }

  const ref = doc(db, 'userDevices', uid, 'items', id);
  const mark = () => {
    try {
      localStorage.setItem(checkedKey(uid), id);
    } catch {
      /* ignore */
    }
  };

  const snap = await getDoc(ref);
  if (snap.exists()) {
    mark();
    return;
  }

  const others = await getDocs(query(collection(db, 'userDevices', uid, 'items'), limit(1)));
  const label = deviceLabel();
  await setDoc(ref, {
    label,
    platform: /Android/i.test(navigator.userAgent) ? 'android' : 'web',
    createdAt: serverTimestamp(),
  });
  mark();
  if (!others.empty) await notifySecurity(uid, 'new_device', label);
};
