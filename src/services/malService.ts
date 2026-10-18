const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN = 'https://api.jikan.moe/v4';
const TTL_MS = 6 * 60 * 60 * 1000;
const LS_PREFIX = 'animeextra:';

export interface AnimeExtra {
  malId: number | null;
  totalEpisodes: number | null; // العدد الكلي الحقيقي (MAL ثم AniList)
  airedEpisodes: number | null; // عدد الحلقات التي عُرضت فعلاً
  malScore: number | null;
  malScoredBy: number | null;
  malRank: number | null;
  status: 'airing' | 'finished' | 'upcoming' | 'unknown';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const readLS = (key: string): { t: number; d: AnimeExtra } | null => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeLS = (key: string, d: AnimeExtra) => {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ t: Date.now(), d }));
  } catch {}
};

const anilistExtra = async (id: number): Promise<any> => {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: `query ($id: Int) { Media(id: $id, type: ANIME) { idMal episodes status nextAiringEpisode { episode } } }`,
      variables: { id },
    }),
  });
  if (!res.ok) throw new Error('anilist-' + res.status);
  const json = await res.json();
  return json?.data?.Media ?? null;
};

// Jikan يسمح بـ 3 طلبات/ثانية، فنرتّب الطلبات في طابور
let jikanChain: Promise<unknown> = Promise.resolve();
const jikanGet = (path: string): Promise<any> => {
  const run = jikanChain.then(async () => {
    await sleep(350);
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${JIKAN}${path}`);
      if (res.status === 429) {
        await sleep(1200 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error('jikan-' + res.status);
      return res.json();
    }
    throw new Error('jikan-429');
  });
  jikanChain = run.catch(() => undefined);
  return run;
};

// يجلب بيانات MyAnimeList الحقيقية (الحلقات والتقييم) لأنمي معرّفه من AniList
export const getAnimeExtra = async (anilistId: number): Promise<AnimeExtra | null> => {
  const key = String(anilistId);
  const cached = readLS(key);
  if (cached && Date.now() - cached.t < TTL_MS) return cached.d;

  try {
    const al = await anilistExtra(anilistId);
    if (!al) return null;

    let mal: any = null;
    if (al.idMal) {
      try {
        mal = (await jikanGet(`/anime/${al.idMal}`))?.data ?? null;
      } catch (e) {
        console.error('MAL fetch failed:', e);
      }
    }

    const status: AnimeExtra['status'] =
      al.status === 'RELEASING' ? 'airing'
      : al.status === 'FINISHED' ? 'finished'
      : al.status === 'NOT_YET_RELEASED' ? 'upcoming'
      : 'unknown';

    const total: number | null = mal?.episodes ?? al.episodes ?? null;
    const aired: number | null = al.nextAiringEpisode?.episode
      ? al.nextAiringEpisode.episode - 1
      : status === 'finished'
      ? total
      : null;

    const data: AnimeExtra = {
      malId: al.idMal ?? null,
      totalEpisodes: total,
      airedEpisodes: aired,
      malScore: typeof mal?.score === 'number' ? mal.score : null,
      malScoredBy: typeof mal?.scored_by === 'number' ? mal.scored_by : null,
      malRank: typeof mal?.rank === 'number' ? mal.rank : null,
      status,
    };
    writeLS(key, data);
    return data;
  } catch (e) {
    console.error(e);
    return cached ? cached.d : null;
  }
};
