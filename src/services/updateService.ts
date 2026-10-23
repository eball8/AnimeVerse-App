import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const REPO = 'eball8/AnimeVerse-App';

// رابط التحميل المباشر لآخر نسخة
export const APK_URL = `https://github.com/${REPO}/releases/download/latest/AnimeVerse.apk`;

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

// رقم آخر بناء منشور (يكتبه GitHub Actions في ملاحظات الإصدار على شكل build=123)
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
