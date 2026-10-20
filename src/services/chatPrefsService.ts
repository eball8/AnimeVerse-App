import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';

// إعدادات شخصية لكل محادثة (لا يراها الطرف الآخر)
export interface ChatPref {
  muted: boolean;
  restricted: boolean;
}

export type ChatPrefMap = Record<string, ChatPref>;

const prefId = (uid: string, convId: string) => `${uid}_${convId}`;

export const subscribeChatPrefs = (uid: string, cb: (m: ChatPrefMap) => void) => {
  const q = query(collection(db, 'chatPrefs'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const out: ChatPrefMap = {};
      snap.forEach((d) => {
        const x = d.data() as { convId?: string; muted?: boolean; restricted?: boolean };
        if (x.convId) out[x.convId] = { muted: !!x.muted, restricted: !!x.restricted };
      });
      cb(out);
    },
    (e) => console.error('chatPrefs error:', e)
  );
};

export const setChatPref = async (
  uid: string,
  convId: string,
  patch: Partial<ChatPref>,
  current?: ChatPref
): Promise<void> => {
  const next: ChatPref = {
    muted: current?.muted ?? false,
    restricted: current?.restricted ?? false,
    ...patch,
  };
  await setDoc(doc(db, 'chatPrefs', prefId(uid, convId)), {
    userId: uid,
    convId,
    muted: next.muted,
    restricted: next.restricted,
    updatedAt: serverTimestamp(),
  });
};
