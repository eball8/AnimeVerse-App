import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeContextType {
  /** اختيار المستخدم: داكن / فاتح / حسب النظام */
  theme: Theme;
  /** المظهر الفعلي المطبّق حالياً (داكن أو فاتح) */
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'animeverse_theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

// لون شريط الحالة/المتصفح لكل مظهر (نفس لون خلفية التطبيق)
const META_COLORS: Record<ResolvedTheme, string> = {
  dark: '#0f0f14',
  light: '#f5f3fa',
};

const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light' || v === 'system';

const readStoredTheme = (): Theme => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isTheme(v)) return v;
  } catch {
    /* التخزين غير متاح */
  }
  return 'dark';
};

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
};

// يعكس المظهر على عناصر الـ DOM فوراً: كلاس على <html> + color-scheme + لون المتصفح
const applyThemeToDom = (resolved: ResolvedTheme) => {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(resolved);
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', META_COLORS[resolved]);
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  // تطبيق المظهر قبل رسم الشاشة (لا يوجد وميض ولا تأخير عند التبديل)
  useLayoutEffect(() => {
    applyThemeToDom(resolvedTheme);
  }, [resolvedTheme]);

  // متابعة تغيّر مظهر النظام لحظياً (يعمل فقط عند اختيار "حسب النظام")
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(MEDIA_QUERY);
    const sync = () => setSystemTheme(media.matches ? 'dark' : 'light');

    if (typeof media.addEventListener === 'function') media.addEventListener('change', sync);
    else (media as any).addListener?.(sync); // متصفحات/WebView قديمة

    // بعض أجهزة أندرويد لا تُطلق حدث change أثناء وجود التطبيق في الخلفية
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);

    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', sync);
      else (media as any).removeListener?.(sync);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
    };
  }, []);

  // مزامنة التغيير بين النوافذ/التبويبات المفتوحة
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setThemeState(isTheme(e.newValue) ? e.newValue : 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* التخزين غير متاح */
    }
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({ theme, resolvedTheme, isDark: resolvedTheme === 'dark', setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
