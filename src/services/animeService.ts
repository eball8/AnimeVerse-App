const JIKAN_BASE = 'https://api.jikan.moe/v4';

export interface Anime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
    webp?: {
      image_url: string;
      large_image_url: string;
    };
  };
  trailer?: {
    youtube_id?: string;
    url?: string;
  };
  type?: string;
  episodes?: number;
  status?: string;
  airing: boolean;
  score?: number;
  rank?: number;
  popularity?: number;
  season?: string;
  year?: number;
  genres: Array<{ mal_id: number; name: string }>;
  studios: Array<{ mal_id: number; name: string }>;
}

interface JikanResponse<T> {
  data: T;
}

// جلب الأنمي الأكثر رواجاً
export const getTopAnime = async (page = 1, limit = 20): Promise<Anime[]> => {
  const res = await fetch(`${JIKAN_BASE}/top/anime?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('failed-top-anime');
  const data = (await res.json()) as JikanResponse<Anime[]>;
  return data.data;
};

// جلب الأنمي الجديد (الموسمي)
export const getSeasonNow = async (limit = 20): Promise<Anime[]> => {
  const res = await fetch(`${JIKAN_BASE}/seasons/now?limit=${limit}`);
  if (!res.ok) throw new Error('failed-season');
  const data = (await res.json()) as JikanResponse<Anime[]>;
  return data.data;
};

// جلب تفاصيل أنمي محدد
export const getAnimeById = async (malId: number): Promise<Anime> => {
  const res = await fetch(`${JIKAN_BASE}/anime/${malId}/full`);
  if (!res.ok) throw new Error('failed-anime-detail');
  const data = (await res.json()) as JikanResponse<Anime>;
  return data.data;
};

// البحث
export const searchAnime = async (query: string, limit = 20): Promise<Anime[]> => {
  if (!query.trim()) return [];
  const res = await fetch(`${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`);
  if (!res.ok) throw new Error('failed-search');
  const data = (await res.json()) as JikanResponse<Anime[]>;
  return data.data;
};
