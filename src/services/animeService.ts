const ANILIST_URL = 'https://graphql.anilist.co';

export interface Anime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  images: {
    jpg: { image_url: string; large_image_url: string; };
  };
  trailer?: { youtube_id?: string; url?: string; };
  type?: string;
  episodes?: number;
  status?: string;
  airing: boolean;
  score?: number;
  year?: number;
  genres: Array<{ mal_id: number; name: string }>;
}

const mapAniListToAnime = (media: any): Anime => ({
  mal_id: media.id,
  title: media.title.romaji || media.title.english || 'غير معروف',
  title_english: media.title.english,
  title_japanese: media.title.native,
  synopsis: media.description?.replace(/<[^>]*>?/gm, '') || 'لا يوجد وصف.',
  images: {
    jpg: {
      image_url: media.coverImage.large,
      large_image_url: media.coverImage.extraLarge,
    },
  },
  trailer: media.trailer ? { url: media.trailer.site === 'youtube' ? `https://youtube.com/watch?v=${media.trailer.id}` : undefined } : undefined,
  type: media.format,
  episodes: media.episodes,
  status: media.status,
  airing: media.status === 'RELEASING',
  score: media.averageScore ? media.averageScore / 10 : undefined,
  year: media.seasonYear,
  genres: media.genres?.map((g: string, i: number) => ({ mal_id: i, name: g })) || [],
});

const fetchFromAniList = async (query: string, variables: any): Promise<Anime[]> => {
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error('failed-api');
  const data = await response.json();
  return data.data.Page.media.map(mapAniListToAnime);
};

export const getTopAnime = async (page = 1, limit = 20): Promise<Anime[]> => {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(sort: TRENDING_DESC, type: ANIME) {
          id title { romaji english native } description coverImage { large extraLarge }
          format episodes status averageScore seasonYear trailer { id site }
          genres
        }
      }
    }
  `;
  return fetchFromAniList(query, { page, perPage: limit });
};

export const getSeasonNow = async (limit = 20): Promise<Anime[]> => {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(season: CURRENT, type: ANIME, sort: POPULARITY_DESC) {
          id title { romaji english native } description coverImage { large extraLarge }
          format episodes status averageScore seasonYear trailer { id site }
          genres
        }
      }
    }
  `;
  return fetchFromAniList(query, { perPage: limit });
};

export const getAnimeById = async (id: number): Promise<Anime> => {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id title { romaji english native } description coverImage { large extraLarge }
        format episodes status averageScore seasonYear trailer { id site }
        genres
      }
    }
  `;
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { id } }),
  });
  if (!response.ok) throw new Error('failed-api');
  const data = await response.json();
  return mapAniListToAnime(data.data.Media);
};

export const searchAnime = async (query: string, limit = 20): Promise<Anime[]> => {
  if (!query.trim()) return [];
  const gql = `
    query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME) {
          id title { romaji english native } description coverImage { large extraLarge }
          format episodes status averageScore seasonYear trailer { id site }
          genres
        }
      }
    }
  `;
  return fetchFromAniList(gql, { search: query, perPage: limit });
};
