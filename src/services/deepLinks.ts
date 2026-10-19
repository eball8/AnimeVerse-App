import { APP_URL } from '../utils/links';

// أنواع الروابط المسموح فتحها داخل التطبيق
const ROUTE = /^\/(user|post|reels)\/([A-Za-z0-9_-]{1,128})$/;
const PENDING_KEY = 'av_pending_link';

export const APP_SCHEME = 'animeverse';

// يحوّل أي رابط خارجي إلى مسار داخلي آمن أو null:
//   https://eball8.github.io/AnimeVerse-App/#/user/UID
//   https://eball8.github.io/AnimeVerse-App/user/UID
//   animeverse://user/UID   ،   animeverse://post/ID   ،   animeverse://reels/ID
export const routeFromUrl = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    let path = '';
    if (u.protocol === `${APP_SCHEME}:`) {
      path = `/${u.hostname}${u.pathname}`;
    } else if (u.protocol === 'https:') {
      if (u.host !== new URL(APP_URL).host) return null;
      if (u.hash.startsWith('#/')) {
        path = u.hash.slice(1);
      } else {
        const base = new URL(APP_URL).pathname.replace(/\/+$/, '');
        path = u.pathname.startsWith(base) ? u.pathname.slice(base.length) : u.pathname;
      }
    } else {
      return null;
    }
    path = path.split('?')[0].replace(/\/+$/, '');
    const m = path.match(ROUTE);
    return m ? `/${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
};

// إن لم يكن المستخدم مسجلاً نحفظ الوجهة ونفتحها بعد الدخول
export const savePendingRoute = (route: string) => {
  try {
    localStorage.setItem(PENDING_KEY, route);
  } catch {
    /* ignore */
  }
};

export const takePendingRoute = (): string | null => {
  try {
    const r = localStorage.getItem(PENDING_KEY);
    if (r) localStorage.removeItem(PENDING_KEY);
    return r && ROUTE.test(r) ? r : null;
  } catch {
    return null;
  }
};
