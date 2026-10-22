import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

// داخل تطبيق الأندرويد لا توجد navigator.share في WebView، فنعرّفها لتفتح
// نافذة المشاركة الأصلية للنظام (واتساب، تيليجرام، سناب، إنستغرام، الملفات...)
export const installNativeShare = (): void => {
  if (!Capacitor.isNativePlatform()) return;

  const shareImpl = async (data?: ShareData): Promise<void> => {
    try {
      await Share.share({
        title: data?.title,
        text: data?.text,
        url: data?.url,
        dialogTitle: data?.title || 'AnimeVerse',
      });
    } catch (e: any) {
      const msg = String(e?.message || e || '').toLowerCase();
      // إغلاق النافذة من المستخدم ليس خطأ: نفس سلوك المتصفح (AbortError)
      if (msg.includes('cancel')) {
        throw new DOMException('Share canceled', 'AbortError');
      }
      throw e;
    }
  };

  try {
    Object.defineProperty(navigator, 'share', {
      value: shareImpl,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'canShare', {
      value: () => true,
      configurable: true,
      writable: true,
    });
  } catch {
    /* ignore */
  }
};
