// حفظ الحسابات على الجهاز (بدون كلمات السر) لعرضها في شاشة الدخول
export type SavedAccount = {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: 'google' | 'password';
  lastUsed: number;
};

const KEY = 'animeverse_saved_accounts';

export const getSavedAccounts = (): SavedAccount[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedAccount[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.lastUsed - a.lastUsed) : [];
  } catch {
    return [];
  }
};

export const saveAccount = (acc: Omit<SavedAccount, 'lastUsed'>): void => {
  try {
    const others = getSavedAccounts().filter((a) => a.uid !== acc.uid);
    localStorage.setItem(KEY, JSON.stringify([{ ...acc, lastUsed: Date.now() }, ...others].slice(0, 5)));
  } catch {
    /* التخزين غير متاح: نتجاهل */
  }
};

export const removeSavedAccount = (uid: string): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(getSavedAccounts().filter((a) => a.uid !== uid)));
  } catch {
    /* ignore */
  }
};
