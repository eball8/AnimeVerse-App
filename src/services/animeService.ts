const JIKAN_BASE = 'https://api.jikan.moe/v4';

export interface Anime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  images: { jpg: { image_url: string; large_image_url: string; }; };
  trailer?: { youtube_id?: string; url?: string; };
  type?: string;
  episodes?: number;
  status?: string;
  airing: boolean;
  score?: number;
  year?: number;
  genres: Array<{ mal_id: number; name: string }>;
}

interface JikanResponse<T> { data: T; }

// دالة مساعدة لإضافة وقت انتظار (Timeout) لمنع التعليق
const fetchWithTimeout = async (url: string, timeout = 8000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export const getTopAnime = async (page = 1, limit = 20): Promise<Anime[]> => {
  const res = await fetchWithTimeout(`${JIKAN_BASE}/top/anime?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('failed-top-anime');
  const data = (await res.json()) as JikanResponse<Anime[]>;
  return data.data;
};

export const getSeasonNow = async (limit = 20): Promise<Anime[]> => {
  const res = await fetchWithTimeout(`${JIKAN_BASE}/seasons/now?limit=${limit}`);
  if (!res.ok) throw new Error('failed-season');
  const data = (await res.json()) as JikanResponse<Anime[]>;
  return data.data;
};

export const getAnimeById = async (malId: number): Promise<Anime> => {
  const res = await fetchWithTimeout(`${JIKAN_BASE}/anime/${malId}/full`);
  if (!res.ok) throw new Error('failed-anime-detail');
  const data = (await res.json()) as JikanResponse<Anime>;
  return data.data;
};

export const searchAnime = async (query: string, limit = 20): Promise<Anime[]> => {
  if (!query.trim()) return [];
  const res = await fetchWithTimeout(`${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`);
  if (!res.ok) throw new Error('failed-search');
  const data = (await res.json()) as JikanResponse<Anime[]>;
  return data.data;
};
