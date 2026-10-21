import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ChatPref {
  muted: boolean;
  restricted: boolean;
  archived: boolean;
  deletedAt: number;
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
        const x = d.data() as {
          convId?: string; muted?: boolean; restricted?: boolean; archived?: boolean; deletedAt?: number;
        };
        if (x.convId) {
          out[x.convId] = {
            muted: !!x.muted,
            restricted: !!x.restricted,
            archived: !!x.archived,
            deletedAt: typeof x.deletedAt === 'number' ? x.deletedAt : 0,
          };
        }
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
    archived: current?.archived ?? false,
    deletedAt: current?.deletedAt ?? 0,
    ...patch,
  };
  await setDoc(doc(db, 'chatPrefs', prefId(uid, convId)), {
    userId: uid,
    convId,
    muted: next.muted,
    restricted: next.restricted,
    archived: next.archived,
    deletedAt: Math.floor(next.deletedAt),
    updatedAt: serverTimestamp(),
  });
};

export const lastMessageMs = (c: { lastMessageAt?: any }): number =>
  c.lastMessageAt?.toMillis?.() ?? Date.now();

export const isDeletedForMe = (c: { lastMessageAt?: any }, pref?: ChatPref): boolean =>
  !!pref?.deletedAt && lastMessageMs(c) <= pref.deletedAt;

export const isInMainList = (c: { lastMessageAt?: any }, pref?: ChatPref): boolean =>
  !pref?.archived && !isDeletedForMe(c, pref);

export const isInArchive = (c: { lastMessageAt?: any }, pref?: ChatPref): boolean =>
  !!pref?.archived && !isDeletedForMe(c, pref);
