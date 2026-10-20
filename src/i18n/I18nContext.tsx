import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, translations } from './translations';
import { extraAr, extraEn } from './extraTranslations';
import { uiTranslations } from './uiTranslations';
import type { Lang } from './translations';

export type LangPref = 'system' | Lang;

const STORAGE_KEY = 'animeverse_lang';

// يكتشف لغة الهاتف، وإن لم تكن مدعومة يستخدم الإنجليزية
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

const readPref = (): LangPref => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'system' || LANGUAGES.some((l) => l.code === v)) return v as LangPref;
  } catch {}
  return 'system';
};

interface I18nContextType {
  lang: Lang;
  pref: LangPref;
  systemLang: Lang;
  dir: 'rtl' | 'ltr';
  setPref: (p: LangPref) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pref, setPrefState] = useState<LangPref>(readPref);
  const [systemLang, setSystemLang] = useState<Lang>(detectSystemLang);

  useEffect(() => {
    const onChange = () => setSystemLang(detectSystemLang());
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, []);

  const lang: Lang = pref === 'system' ? systemLang : pref;
  const dir = LANGUAGES.find((l) => l.code === lang)?.dir || 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setPref = useCallback((p: LangPref) => {
    setPrefState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const extra: Record<string, string> = lang === 'ar' ? extraAr : lang === 'en' ? extraEn : {};
      let s =
        translations[lang][key] ??
        uiTranslations[lang]?.[key] ??
        extra[key] ??
        translations.en[key] ??
        uiTranslations.en[key] ??
        extraEn[key] ??
        translations.ar[key] ??
        extraAr[key] ??
        uiTranslations.ar[key] ??
        key;
      if (vars) {
        Object.keys(vars).forEach((k) => {
          s = s.split(`{${k}}`).join(String(vars[k]));
        });
      }
      return s;
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, pref, systemLang, dir, setPref, t }),
    [lang, pref, systemLang, dir, setPref, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
