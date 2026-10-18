const JIKAN_BASE = 'https://api.jikan.moe/v4';

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

interface JikanResponse<T> { data: T; }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- طابور: طلب واحد كل 450ms (حد Jikan = 3 بالثانية) ----------
const MIN_GAP_MS = 450;
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
const LS_PREFIX = 'jikan:';

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
const fetchWithTimeout = async (url: string, timeout = 15000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(id);
  }
};

const fetchJson = async (path: string): Promise<any> => {
  let lastError: unknown = new Error('jikan-failed');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await schedule(() => fetchWithTimeout(`${JIKAN_BASE}${path}`));
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`jikan-${res.status}`);
        await sleep(1200 * (attempt + 1));
        continue;
      }
      throw new Error(`jikan-${res.status}`); // 404 وغيره: لا فائدة من الإعادة
    } catch (e: any) {
      lastError = e;
      if (e?.message?.startsWith('jikan-4')) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
};

const jikanGet = async <T>(path: string, ttlMs: number): Promise<T> => {
  const cached = readCache(path);
  if (cached && Date.now() - cached.t < ttlMs) return cached.d as T;

  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;

  const p = fetchJson(path)
    .then((json) => {
      writeCache(path, json);
      return json as T;
    })
    .catch((err) => {
      if (cached) return cached.d as T; // كاش قديم أفضل من شاشة فاضية
      throw err;
    })
    .finally(() => inflight.delete(path));

  inflight.set(path, p);
  return p;
};

const uniqueById = (list: Anime[]): Anime[] => {
  const seen = new Set<number>();
  return (list || []).filter((a) => {
    if (!a || seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ---------- الدوال (نفس الأسماء والتواقيع القديمة) ----------
export const getTopAnime = async (page = 1, limit = 20): Promise<Anime[]> => {
  const json = await jikanGet<JikanResponse<Anime[]>>(`/top/anime?page=${page}&limit=${limit}`, 30 * MIN);
  return uniqueById(json.data);
};

export const getSeasonNow = async (limit = 20): Promise<Anime[]> => {
  const json = await jikanGet<JikanResponse<Anime[]>>(`/seasons/now?limit=${limit}`, 30 * MIN);
  return uniqueById(json.data);
};

export const getAnimeById = async (malId: number): Promise<Anime> => {
  const json = await jikanGet<JikanResponse<Anime>>(`/anime/${malId}/full`, 24 * HOUR);
  return json.data;
};

export const searchAnime = async (query: string, limit = 20): Promise<Anime[]> => {
  if (!query.trim()) return [];
  const json = await jikanGet<JikanResponse<Anime[]>>(
    `/anime?q=${encodeURIComponent(query.trim())}&limit=${limit}&sfw=true`,
    5 * MIN
  );
  return uniqueById(json.data);
};

export const getGenres = async (): Promise<Array<{ mal_id: number; name: string }>> => {
  const json = await jikanGet<JikanResponse<Array<{ mal_id: number; name: string }>>>(
    `/genres/anime?filter=genres`,
    24 * HOUR
  );
  return json.data;
};

export const getAnimeByGenre = async (genreId: number, limit = 20): Promise<Anime[]> => {
  const json = await jikanGet<JikanResponse<Anime[]>>(
    `/anime?genres=${genreId}&limit=${limit}&order_by=score&sort=desc`,
    30 * MIN
  );
  return uniqueById(json.data);
};
