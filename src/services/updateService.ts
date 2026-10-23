import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const REPO = 'eball8/AnimeVerse-App';

// رابط التحميل المباشر لآخر نسخة
export const APK_URL = `https://github.com/${REPO}/releases/download/latest/AnimeVerse.apk`;

// وثيقة "النشر": نستخدم مجموعة announcements الموجودة (قراءة للمسجّلين، كتابة للأدمن فقط).
// active:false تخفيها من شريط الإعلانات، وبدون createdAt لا تظهر في قائمة الإعلانات.
const publishRef = () => doc(db, 'announcements', 'app_update');

// رقم البناء المثبّت على هاتف المستخدم (versionCode). على المتصفح يرجع 0 فلا تظهر اللوحة.
export const getInstalledBuild = async (): Promise<number> => {
  if (!Capacitor.isNativePlatform()) return 0;
  try {
    const info = await CapApp.getInfo();
    return parseInt(info.build, 10) || 0;
  } catch {
    return 0;
  }
};

// رقم آخر بناء جاهز على GitHub (يكتبه GitHub Actions في ملاحظات الإصدار على شكل build=123)
export const getLatestBuild = async (): Promise<number> => {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/latest`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const m = String(data?.body || '').match(/build=(\d+)/);
    return m ? parseInt(m[1], 10) || 0 : 0;
  } catch {
    return 0;
  }
};

// آخر بناء نشره الأدمن للمستخدمين
export const getPublishedBuild = async (): Promise<number> => {
  try {
    const s = await getDoc(publishRef());
    return s.exists() ? Number(s.data().build) || 0 : 0;
  } catch {
    return 0;
  }
};

// مراقبة لحظية: تُستدعى فور نشر الأدمن لتحديث جديد
export const subscribePublishedBuild = (cb: (build: number) => void): (() => void) =>
  onSnapshot(
    publishRef(),
    (s) => cb(s.exists() ? Number(s.data().build) || 0 : 0),
    () => cb(0)
  );

// نشر التحديث (للأدمن فقط حسب قواعد Firestore)
export const publishUpdate = async (build: number): Promise<void> => {
  await setDoc(publishRef(), {
    kind: 'app_update',
    active: false,
    build,
    publishedAt: serverTimestamp(),
  });
};
