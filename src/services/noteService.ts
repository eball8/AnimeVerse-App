import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const NOTE_TTL_MS = 24 * 60 * 60 * 1000;
export const NOTE_MAX = 60;

export interface Note {
  uid: string;
  text: string;
  createdAt: any;
}

// ملاحظة واحدة لكل مستخدم تظهر فوق صورته وتختفي بعد 24 ساعة
export const setNote = async (uid: string, text: string): Promise<void> => {
  const clean = text.trim().slice(0, NOTE_MAX);
  if (!clean) return;
  await setDoc(doc(db, 'notes', uid), { uid, text: clean, createdAt: serverTimestamp() });
};

export const deleteNote = async (uid: string): Promise<void> => {
  await deleteDoc(doc(db, 'notes', uid));
};

export const subscribeNotes = (cb: (notes: Record<string, Note>) => void) => {
  const since = Timestamp.fromMillis(Date.now() - NOTE_TTL_MS);
  const q = query(collection(db, 'notes'), where('createdAt', '>', since), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      const map: Record<string, Note> = {};
      snap.forEach((d) => {
        const x = d.data() as any;
        map[d.id] = { uid: d.id, text: x.text || '', createdAt: x.createdAt };
      });
      cb(map);
    },
    (e) => {
      console.error('notes error:', e);
      cb({});
    }
  );
};
