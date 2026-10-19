
export type DeepLinkTarget =
  | {
      type: 'post';
      id: string;
    }
  | {
      type: 'anime';
      id: string;
    }
  | {
      type: 'episode';
      id: string;
    }
  | {
      type: 'profile';
      id: string;
    }
  | {
      type: 'story';
      id: string;
    };

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
