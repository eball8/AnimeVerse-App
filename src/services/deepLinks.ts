export type DeepLinkTarget =
  | { type: 'post'; id: string }
  | { type: 'anime'; id: string }
  | { type: 'episode'; id: string }
  | { type: 'profile'; id: string }
  | { type: 'story'; id: string };

const MAX_ID_LENGTH = 200;

const ALLOWED_HOSTS = new Set([
  'animeverse.app',
  'www.animeverse.app',
]);

/**
 * التحقق من معرّف الرابط قبل استخدامه في التنقل.
 */
function validId(value: string | null): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

/**
 * تحليل رابط AnimeVerse إلى وجهة داخل التطبيق.
 *
 * الصيغ المدعومة:
 * https://animeverse.app/post/POST_ID
 * https://animeverse.app/anime/ANIME_ID
 * https://animeverse.app/episode/EPISODE_ID
 * https://animeverse.app/profile/USER_ID
 * https://animeverse.app/user/USER_ID (رابط مشاركة الملف الشخصي / رمز QR)
 * https://animeverse.app/story/STORY_ID
 *
 * كما يدعم المسارات النسبية داخل التطبيق.
 */
export function parseDeepLink(
  input: string
): DeepLinkTarget | null {
  if (!input || input.length > 2048) {
    return null;
  }

  try {
    const url = new URL(input, 'https://animeverse.app');

    if (
      url.protocol !== 'https:' ||
      !ALLOWED_HOSTS.has(url.hostname.toLowerCase())
    ) {
      return null;
    }

    const segments = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    if (segments.length !== 2) {
      return null;
    }

    const [type, id] = segments;

    if (!validId(id)) {
      return null;
    }

    switch (type.toLowerCase()) {
      case 'post':
        return { type: 'post', id };

      case 'anime':
        return { type: 'anime', id };

      case 'episode':
        return { type: 'episode', id };

      case 'profile':
      case 'user':
        return { type: 'profile', id };

      case 'story':
        return { type: 'story', id };

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * إنشاء رابط مشاركة صالح لوجهة داخل التطبيق.
 */
export function createDeepLink(
  target: DeepLinkTarget
): string {
  if (!validId(target.id)) {
    throw new Error('Invalid deep link ID');
  }

  const paths: Record<DeepLinkTarget['type'], string> = {
    post: 'post',
    anime: 'anime',
    episode: 'episode',
    profile: 'profile',
    story: 'story',
  };

  return `https://animeverse.app/${paths[target.type]}/${encodeURIComponent(target.id)}`;
}

/**
 * رابط مشاركة الملف الشخصي (يُستعمل في رمز QR وكل خيارات المشاركة):
 * https://animeverse.app/user/{userId}
 */
export function userProfileLink(userId: string): string {
  if (!validId(userId)) {
    throw new Error('Invalid user ID');
  }

  return `https://animeverse.app/user/${encodeURIComponent(userId)}`;
}

const PENDING_ROUTE_KEY = 'av_pending_route';

/**
 * تحويل رابط خارجي إلى مسار داخلي في التطبيق (react-router).
 * يرجع null إذا كان الرابط غير صالح أو لا توجد صفحة له.
 */
export function routeFromUrl(url: string): string | null {
  const target = parseDeepLink(url);

  if (!target) {
    return null;
  }

  const id = encodeURIComponent(target.id);

  switch (target.type) {
    case 'post':
      return `/post/${id}`;

    case 'anime':
      return `/anime/${id}`;

    case 'profile':
      return `/user/${id}`;

    // لا توجد صفحات مخصصة للحلقة أو القصة حالياً
    case 'episode':
    case 'story':
    default:
      return null;
  }
}

/**
 * حفظ الوجهة إلى أن ينتهي تسجيل الدخول.
 */
export function savePendingRoute(route: string): void {
  try {
    sessionStorage.setItem(PENDING_ROUTE_KEY, route);
  } catch {
    /* تجاهل */
  }
}

/**
 * قراءة الوجهة المحفوظة وحذفها (مرة واحدة).
 */
export function takePendingRoute(): string | null {
  try {
    const route = sessionStorage.getItem(PENDING_ROUTE_KEY);

    if (route) {
      sessionStorage.removeItem(PENDING_ROUTE_KEY);
    }

    return route;
  } catch {
    return null;
  }
}
