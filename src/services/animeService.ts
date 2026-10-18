const ANILIST_URL = 'https://graphql.anilist.co';

export interface Anime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  images: { jpg: { image_url: string; large_image_url: string } };
  trailer?: {
    youtube_id?: string;
    url?: string;
    embed_url?: string;
    images?: { image_url?: string; large_image_url?: string };
  };
  type?: string;
  episodes?: number;
  status?: string;
  airing: boolean;
  score?: number;
  year?: number;
  genres: Array<{ mal_id: number; name: string }>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- طابور بسيط (حد AniList = 90 طلب/دقيقة) ----------
const MIN_GAP_MS = 700;
let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();

const schedule = <T>(task: () => Promise<T>): Promise<T> => {
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  });
  chain = run.catch(() => undefined);
  return run;
};

// ---------- كاش (ذاكرة + localStorage) ----------
const memCache = new Map<string, { t: number; d: any }>();
const inflight = new Map<string, Promise<any>>();
const LS_PREFIX = 'anilist:';

const readCache = (key: string): { t: number; d: any } | null => {
  const m = memCache.get(key);
  if (m) return m;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      memCache.set(key, parsed);
      return parsed;
    }
  } catch {}
  return null;
};

const writeCache = (key: string, d: any) => {
  const entry = { t: Date.now(), d };
  memCache.set(key, entry);
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry)); } catch {}
};

// ---------- جلب مع مهلة وإعادة محاولة ----------
const fetchWithTimeout = async (body: string, timeout = 15000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(ANILIST_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
  } finally {
    clearTimeout(id);
  }
};

const fetchJson = async (query: string, variables: Record<string, unknown>): Promise<any> => {
  const body = JSON.stringify({ query, variables });
  let lastError: unknown = new Error('anilist-failed');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await schedule(() => fetchWithTimeout(body));
      if (res.ok) {
        const json = await res.json();
        if (json?.errors?.length && !json?.data) throw new Error('anilist-gql-error');
        return json.data;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`anilist-${res.status}`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`anilist-${res.status}`);
    } catch (e: any) {
      lastError = e;
      if (e?.message === 'anilist-gql-error' || /^anilist-4/.test(e?.message || '')) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
};

const gql = async <T>(
  name: string,
  query: string,
  variables: Record<string, unknown>,
  ttlMs: number
): Promise<T> => {
  const key = `${name}:${JSON.stringify(variables)}`;
  const cached = readCache(key);
  if (cached && Date.now() - cached.t < ttlMs) return cached.d as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fetchJson(query, variables)
    .then((data) => {
      writeCache(key, data);
      return data as T;
    })
    .catch((err) => {
      if (cached) return cached.d as T;
      throw err;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
};

// ---------- تحويل بيانات AniList إلى نفس شكل Anime القديم ----------
const MEDIA_FIELDS = `
  id
  title { romaji english native }
  description(asHtml: false)
  coverImage { large extraLarge }
  format
  episodes
  status
  averageScore
  seasonYear
  genres
  trailer { id site thumbnail }
`;

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

const cleanText = (s?: string | null): string | undefined => {
  if (!s) return undefined;
  const t = s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  return t || undefined;
};

const toAnime = (m: any): Anime => {
  const yt = m.trailer && m.trailer.site === 'youtube' ? m.trailer.id : undefined;
  const status =
    m.status === 'RELEASING' ? 'Currently Airing'
    : m.status === 'FINISHED' ? 'Finished Airing'
    : m.status === 'NOT_YET_RELEASED' ? 'Not yet aired'
    : m.status || undefined;

  return {
    mal_id: m.id,
    title: m.title?.romaji || m.title?.english || m.title?.native || '',
    title_english: m.title?.english || undefined,
    title_japanese: m.title?.native || undefined,
    synopsis: cleanText(m.description),
    images: {
      jpg: {
        image_url: m.coverImage?.large || '',
        large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || '',
      },
    },
    trailer: yt
      ? {
          youtube_id: yt,
          url: `https://www.youtube.com/watch?v=${yt}`,
          embed_url: `https://www.youtube.com/embed/${yt}`,
          images: {
            image_url: `https://img.youtube.com/vi/${yt}/default.jpg`,
            large_image_url: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`,
          },
        }
      : undefined,
    type: m.format || undefined,
    episodes: m.episodes || undefined,
    status,
    airing: m.status === 'RELEASING',
    score: m.averageScore ? Math.round(m.averageScore) / 10 : undefined,
    year: m.seasonYear || undefined,
    genres: ((m.genres || []) as string[]).map((name, i) => ({ mal_id: i + 1, name })),
  };
};

const uniqueById = (list: Anime[]): Anime[] => {
  const seen = new Set<number>();
  return list.filter((a) => {
    if (!a || seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const PAGE_QUERY = `
  query ($page: Int, $perPage: Int, $sort: [MediaSort], $search: String, $genre: String, $status: MediaStatus) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, isAdult: false, sort: $sort, search: $search, genre: $genre, status: $status) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const DETAIL_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
    }
  }
`;

const loadPage = async (name: string, vars: Record<string, unknown>, ttl: number): Promise<Anime[]> => {
  const data = await gql<any>(name, PAGE_QUERY, vars, ttl);
  return uniqueById((data?.Page?.media || []).map(toAnime));
};

// ---------- الدوال (نفس الأسماء والتواقيع القديمة) ----------
export const getTopAnime = (page = 1, limit = 20): Promise<Anime[]> =>
  loadPage('top', { page, perPage: limit, sort: ['POPULARITY_DESC'] }, 30 * MIN);

export const getSeasonNow = (limit = 20): Promise<Anime[]> =>
  loadPage('season', { page: 1, perPage: limit, sort: ['POPULARITY_DESC'], status: 'RELEASING' }, 30 * MIN);

export const getAnimeById = async (malId: number): Promise<Anime> => {
  const data = await gql<any>('detail', DETAIL_QUERY, { id: Number(malId) }, 24 * HOUR);
  if (!data?.Media) throw new Error('not-found');
  return toAnime(data.Media);
};

export const searchAnime = async (query: string, limit = 20): Promise<Anime[]> => {
  if (!query.trim()) return [];
  return loadPage('search', { page: 1, perPage: limit, sort: ['SEARCH_MATCH'], search: query.trim() }, 5 * MIN);
};

export const getGenres = async (): Promise<Array<{ mal_id: number; name: string }>> =>
  GENRES.map((name, i) => ({ mal_id: i + 1, name }));

export const getAnimeByGenre = async (genreId: number, limit = 20): Promise<Anime[]> => {
  const genre = GENRES[genreId - 1];
  if (!genre) return [];
  return loadPage('genre', { page: 1, perPage: limit, sort: ['POPULARITY_DESC'], genre }, 30 * MIN);
};
