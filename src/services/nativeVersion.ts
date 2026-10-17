import { Preferences } from '@capacitor/preferences';

const VERSION_KEY = 'animeverse_app_version';

// حفظ الإصدار الحالي بشكل دائم (لا يمسح مع الكاش)
export const saveAppVersion = async (version: string): Promise<void> => {
  try {
    await Preferences.set({ key: VERSION_KEY, value: version });
  } catch (e) {
    console.error('Failed to save version:', e);
  }
};

// قراءة الإصدار المحفوظ
export const getAppVersion = async (): Promise<string | null> => {
  try {
    const { value } = await Preferences.get({ key: VERSION_KEY });
    return value;
  } catch (e) {
    return null;
  }
};
