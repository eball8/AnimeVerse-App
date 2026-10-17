import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// مسح الكاش المؤقت فقط (لا يمسح بيانات تسجيل الدخول أو الإصدار)
export const clearAppCache = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    // في المتصفح: مسح الكاش الخاص بالموقع فقط
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    return true;
  }

  try {
    // في الأندرويد: مسح مجلد الكاش المخصص للتطبيق فقط
    await Filesystem.rmdir({
      path: 'cache',
      directory: Directory.Cache,
      recursive: true,
    });
    return true;
  } catch (e) {
    console.error('Failed to clear cache:', e);
    return false;
  }
};
