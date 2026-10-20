// ترجمة خارج مكوّنات React (للخدمات مثل accountService و cloudinaryService)
// تقرأ اللغة المختارة من التخزين المحلي نفسه الذي يستخدمه I18nContext
import { LANGUAGES } from './translations';
import type { Lang } from './translations';

const packModules = import.meta.glob('./packs/*.ts', { eager: true, import: 'default' }) as Record<
  string,
  Record<Lang, Record<string, string>>
>;

const packs: Record<Lang, Record<string, string>> = { ar: {}, en: {}, fr: {}, es: {} };
Object.values(packModules).forEach((p) => {
  (Object.keys(packs) as Lang[]).forEach((l) => Object.assign(packs[l], p?.[l] || {}));
});

const STORAGE_KEY = 'animeverse_lang';

const detectSystemLang = (): Lang => {
  const list =
    typeof navigator !== 'undefined'
      ? navigator.languages && navigator.languages.length
        ? Array.from(navigator.languages)
        : [navigator.language]
      : [];
  for (const l of list) {
    const code = String(l || '').toLowerCase().split('-')[0];
    const hit = LANGUAGES.find((x) => x.code === code);
    if (hit) return hit.code;
  }
  return 'en';
};

export const currentLang = (): Lang => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    const hit = LANGUAGES.find((l) => l.code === v);
    if (hit) return hit.code;
  } catch {
    // نستخدم لغة النظام
  }
  return detectSystemLang();
};

export const tr = (key: string, vars?: Record<string, string | number>): string => {
  const lang = currentLang();
  let s = packs[lang][key] ?? packs.en[key] ?? packs.ar[key] ?? key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      s = s.split(`{${k}}`).join(String(vars[k]));
    });
  }
  return s;
};
