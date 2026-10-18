import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Anime } from './animeService';

// معرّفات الأنمي الخاص تبدأ بـ c_ لتمييزها عن معرّفات MyAnimeList
export const isCustomId = (id?: string): boolean => !!id && id.startsWith('c_');

const toAnime = (id: string, d: any): Anime => ({
  mal_id: id as unknown as number,
  title: d.title,
  title_english: d.titleEnglish || undefined,
  synopsis: d.synopsis || undefined,
  images: { jpg: { image_url: d.imageUrl, large_image_url: d.imageUrl } },
  trailer: d.trailerUrl ? { url: d.trailerUrl } : undefined,
  type: d.type || undefined,
  episodes: d.episodes || undefined,
  status: d.airing ? 'Currently Airing' : 'Finished Airing',
  airing: !!d.airing,
  score: d.score || undefined,
  year: d.year || undefined,
  genres: ((d.genres || []) as string[]).map((name, i) => ({ mal_id: i, name })),
});

export const listCustomAnime = async (n = 60): Promise<Anime[]> => {
  const snap = await getDocs(query(collection(db, 'customAnime'), orderBy('createdAt', 'desc'), limit(n)));
  return snap.docs.map((d) => toAnime(d.id, d.data()));
};

export const getCustomAnime = async (id: string): Promise<Anime> => {
  const s = await getDoc(doc(db, 'customAnime', id));
  if (!s.exists()) throw new Error('not-found');
  return toAnime(id, s.data());
};
