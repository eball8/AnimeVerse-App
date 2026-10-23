import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';

const EzvNative = registerPlugin<{
  isInstalled(): Promise<{ installed: boolean }>;
  play(opts: { url: string; title?: string }): Promise<void>;
}>('EzvPlayer');

export const EZV_STORE_URL = 'https://play.google.com/store/apps/details?id=com.player.easy';

export type EzvResult = 'opened' | 'not-installed' | 'failed';

// يفتح الرابط داخل EZV Player مباشرة. النتيجة تخبر الواجهة بما حدث لتتصرف.
export const playInEzv = async (url: string, title = ''): Promise<EzvResult> => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 'failed';
  try {
    await EzvNative.play({ url, title });
    return 'opened';
  } catch (e: any) {
    const code = String(e?.message || e?.code || '');
    if (code.includes('NOT_INSTALLED')) return 'not-installed';
    return 'failed';
  }
};

export const openExternal = async (url: string): Promise<void> => {
  try {
    if (Capacitor.isNativePlatform()) await Browser.open({ url });
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(url, '_blank');
  }
};
