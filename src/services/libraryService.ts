import {
  collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type LibStatus = 'none' | 'watching' | 'planned' | 'completed' | 'dropped';

export interface LibItem {
  id: string;
  userId: string;
  animeId: string;
  title: string;
  imageUrl: string;
  favorite: boolean;
  status: LibStatus;
  updatedAt?: any;
}

export const STATUS_LABELS: Record<LibStatus, string> = {
  none: 'بدون حالة',
  watching: 'أشاهده الآن',
  planned: 'سأشاهده',
  completed: 'أكملته',
  dropped: 'تركته',
};

// نستخدم استعلاماً لأن قراءة وثيقة غير موجودة تُرفض بالقواعد
export const getLibItem = async (uid: string, animeId: string): Promise<LibItem | null> => {
  const snap = await getDocs(
    query(collection(db, 'library'), where('userId', '==', uid), where('animeId', '==', animeId), limit(1))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as LibItem;
};

export const saveLibItem = async (
  uid: string,
  anime: { animeId: string; title: string; imageUrl: string },
  favorite: boolean,
  status: LibStatus
): Promise<void> => {
  const ref = doc(db, 'library', `${uid}_${anime.animeId}`);
  if (!favorite && status === 'none') {
    try { await deleteDoc(ref); } catch { /* غير موجودة أصلاً */ }
    return;
  }
  await setDoc(ref, {
    userId: uid,
    animeId: anime.animeId,
    title: anime.title.slice(0, 200),
    imageUrl: (anime.imageUrl || '').slice(0, 500),
    favorite,
    status,
    updatedAt: serverTimestamp(),
  });
};

export const listLibrary = async (uid: string): Promise<LibItem[]> => {
  const snap = await getDocs(query(collection(db, 'library'), where('userId', '==', uid), limit(500)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibItem));
  const t = (i: LibItem) => i.updatedAt?.toMillis?.() ?? Date.now();
  return items.sort((a, b) => t(b) - t(a));
};
