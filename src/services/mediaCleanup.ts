import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { deleteVideoFromR2 } from './cloudinaryService';

// يحذف ملف الفيديو من R2 فقط إذا لم يعد أي منشور أو قصة يستخدمه
// (إعادة النشر ومشاركة المنشور كقصة واستخدام الصوت تعيد استخدام نفس الرابط).
export const releaseVideoIfUnused = async (url: string): Promise<void> => {
  try {
    const checks = await Promise.all([
      getDocs(query(collection(db, 'posts'), where('mediaUrl', '==', url), limit(1))),
      getDocs(query(collection(db, 'posts'), where('audioUrl', '==', url), limit(1))),
      getDocs(query(collection(db, 'stories'), where('mediaUrl', '==', url), limit(1))),
    ]);
    if (checks.every((s) => s.empty)) await deleteVideoFromR2(url);
  } catch {
    /* عند أي شك نترك الملف ولا نحذفه */
  }
};
