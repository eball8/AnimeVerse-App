import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logAdmin } from './adminLog';

// حالة القفل تُحفظ في وثيقة: episodes/{animeId}_unlock
// - الوثيقة موجودة و unlocked=true  => الأنمي مفتوح للجميع
// - الوثيقة غير موجودة              => الأنمي مقفل مؤقتاً (الافتراضي)
// نستخدم مجموعة episodes لأن قواعد Firestore الحالية تسمح بالقراءة للجميع والكتابة للأدمن فقط،
// فلا حاجة لتعديل firestore.rules.
const lockRef = (animeId: string) => doc(db, 'episodes', `${String(animeId).trim()}_unlock`);

export const isAnimeUnlocked = async (animeId: string): Promise<boolean> => {
  try {
    const s = await getDoc(lockRef(animeId));
    return s.exists() && s.data()?.unlocked === true;
  } catch (e) {
    console.error('isAnimeUnlocked failed:', e);
    return false;
  }
};

// فتح الأنمي + إعلان لجميع المستخدمين (يظهر في الرئيسية وفي شاشة الإشعارات)
export const unlockAnime = async (animeId: string, title: string, imageUrl?: string): Promise<void> => {
  const id = String(animeId).trim();
  const batch = writeBatch(db);
  batch.set(lockRef(id), { unlocked: true, unlockedAt: serverTimestamp() });
  const annRef = doc(collection(db, 'announcements'));
  batch.set(annRef, {
    kind: 'anime_unlocked',
    animeId: id,
    animeTitle: title.slice(0, 100),
    ...(imageUrl ? { imageUrl } : {}),
    // نص احتياطي بالعربية (يُترجم عند العرض حسب لغة التطبيق)
    title: `🎉 تم فتح أنمي ${title}!`.slice(0, 100),
    body: 'الحلقات متاحة الآن، استمتع بالمشاهدة 🍿',
    active: true,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  logAdmin('unlock_anime', 'anime', id, title);
};

export const lockAnime = async (animeId: string, title = ''): Promise<void> => {
  const id = String(animeId).trim();
  await deleteDoc(lockRef(id));
  logAdmin('lock_anime', 'anime', id, title);
};
