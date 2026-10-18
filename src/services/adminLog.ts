import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// يسجّل فعل الأدمن في adminLogs (لا يمكن تعديله أو حذفه حسب القواعد)
export const logAdmin = async (
  action: string,
  targetType: string,
  targetId: string,
  details = ''
): Promise<void> => {
  const u = auth.currentUser;
  if (!u) return;
  try {
    await addDoc(collection(db, 'adminLogs'), {
      adminUid: u.uid,
      adminName: (u.displayName || u.email || '').slice(0, 80),
      action,
      targetType,
      targetId: String(targetId).slice(0, 200),
      details: details.slice(0, 300),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('adminLog failed:', e);
  }
};
