import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAnimeById } from './animeService';
import { getCustomAnime, isCustomId } from './customAnimeService';

// وثيقة الحلقة: episodes/{animeId}_{episodeNumber}
// الأدمن هو من يضيف الحلقات، وكل مرة يضيف سيرفراً نحدّث بيانات الحلقة ليظهر في "أحدث الحلقات".
export interface EpisodeItem {
  id: string;
  animeId: string;
  episodeNumber: number;
  title: string;
  imageUrl: string;
}

const toItem = (id: string, d: any): EpisodeItem | null => {
  const episodeNumber = Number(d.episodeNumber);
  if (!d.animeId || !episodeNumber) return null;
  return {
    id,
    animeId: String(d.animeId),
    episodeNumber,
    title: d.animeTitle || '',
    imageUrl: d.imageUrl || '',
  };
};

// يُستدعى بعد حفظ سيرفر لحلقة: يسجّل بيانات الأنمي (الاسم والبوستر) على وثيقة الحلقة
export const registerEpisode = async (animeId: string, episodeNumber: number): Promise<void> => {
  const aid = String(animeId).trim();
  let title = '';
  let imageUrl = '';
  try {
    const a = isCustomId(aid) ? await getCustomAnime(aid) : await getAnimeById(Number(aid));
    title = a.title_english || a.title || '';
    imageUrl = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '';
  } catch (e) {
    console.error('registerEpisode: anime lookup failed', e);
  }
  await setDoc(
    doc(db, 'episodes', `${aid}_${episodeNumber}`),
    {
      animeId: aid,
      episodeNumber,
      ...(title ? { animeTitle: title } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

// أحدث الحلقات المضافة (الأحدث أولاً)
export const listLatestEpisodes = async (n = 30): Promise<EpisodeItem[]> => {
  const snap = await getDocs(query(collection(db, 'episodes'), orderBy('updatedAt', 'desc'), limit(n)));
  return snap.docs.map((d) => toItem(d.id, d.data())).filter((x): x is EpisodeItem => !!x && !!x.imageUrl);
};

// أرقام الحلقات التي أضافها الأدمن لأنمي معيّن (تُستخدم للأنميات المستمرة)
export const listAnimeEpisodeNumbers = async (animeId: string): Promise<number[]> => {
  const snap = await getDocs(query(collection(db, 'episodes'), where('animeId', '==', String(animeId))));
  return snap.docs
    .map((d) => Number(d.data().episodeNumber))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
};
