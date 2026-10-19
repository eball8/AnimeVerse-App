import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { decryptJson, encryptJson, getLocalKey, getSharedKey } from './cryptoService';
import type { LocalKey } from './cryptoService';

export type ChatPayload =
  | { k: 't'; v: string }
  | { k: 'v'; url: string; key: string; iv: string; dur: number; mime: string }
  | { k: 'm'; url: string; key: string; iv: string; mime: string; size: number; w?: number; h?: number };

export interface Conversation {
  id: string;
  otherUid: string;
  lastMessageAt: any;
}

export interface RawMessage {
  id: string;
  senderId: string;
  ciphertext: string;
  iv: string;
  senderKeyId: string;
  recipientKeyId: string;
  createdAt: any;
}

export interface PublicKeyInfo {
  keyId: string;
  publicKey: string;
}

// --- واجهات جديدة للقصص ---
export interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  type: 'image' | 'video';
  createdAt: any;
  viewedBy?: string[];
}

export const convIdOf = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

export const subscribeConversations = (me: string, cb: (items: Conversation[]) => void) => {
  const q = query(collection(db, 'conversations'), where('members', 'array-contains', me), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data() as any;
        const other = (data.members as string[]).find((m) => m !== me) || '';
        return { id: d.id, otherUid: other, lastMessageAt: data.lastMessageAt } as Conversation;
      });
      const t = (c: Conversation) => c.lastMessageAt?.toMillis?.() ?? Date.now();
      items.sort((a, b) => t(b) - t(a));
      cb(items);
    },
    (e) => console.error('conversations error:', e)
  );
};

// قراءة وثيقة غير موجودة تُرفض بالقواعد، لذلك نستخدم استعلاماً
export const conversationExists = async (me: string, convId: string): Promise<boolean> => {
  const snap = await getDocs(
    query(collection(db, 'conversations'), where('members', 'array-contains', me), limit(200))
  );
  return snap.docs.some((d) => d.id === convId);
};

export const getPublicKeyInfo = async (uid: string): Promise<PublicKeyInfo | null> => {
  const snap = await getDoc(doc(db, 'publicKeys', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return { keyId: d.keyId, publicKey: d.publicKey };
};

export const subscribeMessages = (
  convId: string,
  cb: (items: RawMessage[]) => void,
  onError?: (e: unknown) => void
) => {
  const q = query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RawMessage)).reverse()),
    onError
  );
};

// يحترم إعداد الخصوصية عند بدء محادثة جديدة فقط (everyone | following | nobody)
const assertCanMessage = async (me: string, other: string): Promise<void> => {
  const snap = await getDoc(doc(db, 'users', other));
  const mode = (snap.data() as { messagePrivacy?: string } | undefined)?.messagePrivacy;
  if (mode === 'nobody') throw new Error('MESSAGES_CLOSED');
  if (mode === 'following') {
    const f = await getDoc(doc(db, 'follows', `${other}_${me}`));
    if (!f.exists()) throw new Error('MESSAGES_CLOSED');
  }
};

export const sendPayload = async (
  me: string,
  other: string,
  payload: ChatPayload,
  conversationAlreadyExists: boolean
): Promise<void> => {
  const local = await getLocalKey(me);
  if (!local) throw new Error('NO_LOCAL_KEY');
  const theirs = await getPublicKeyInfo(other);
  if (!theirs) throw new Error('RECIPIENT_NO_KEY');

  const shared = await getSharedKey(local.privateKey, local.keyId, theirs.keyId, theirs.publicKey);
  const { ciphertext, iv } = await encryptJson(shared, payload);

  const convId = convIdOf(me, other);
  if (!conversationAlreadyExists) {
    await assertCanMessage(me, other);
    const members = [me, other].sort();
    await setDoc(doc(db, 'conversations', convId), {
      members,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
    });
  }

  await addDoc(collection(db, 'conversations', convId, 'messages'), {
    senderId: me,
    ciphertext,
    iv,
    senderKeyId: local.keyId,
    recipientKeyId: theirs.keyId,
    createdAt: serverTimestamp(),
  });

  if (conversationAlreadyExists) {
    await updateDoc(doc(db, 'conversations', convId), { lastMessageAt: serverTimestamp() });
  }
};

export const decryptMessage = async (
  me: string,
  local: LocalKey,
  theirs: PublicKeyInfo | null,
  m: RawMessage
): Promise<ChatPayload | null> => {
  try {
    if (!theirs) return null;
    const mine = m.senderId === me;
    const myKeyId = mine ? m.senderKeyId : m.recipientKeyId;
    const theirKeyId = mine ? m.recipientKeyId : m.senderKeyId;
    if (myKeyId !== local.keyId || theirKeyId !== theirs.keyId) return null;
    const shared = await getSharedKey(local.privateKey, local.keyId, theirs.keyId, theirs.publicKey);
    return (await decryptJson(shared, m.ciphertext, m.iv)) as ChatPayload;
  } catch {
    return null;
  }
};

export const removeMessage = async (convId: string, msgId: string): Promise<void> => {
  await deleteDoc(doc(db, 'conversations', convId, 'messages', msgId));
};

// ==========================================
// دوال جديدة لجلب القصص (Stories)
// ==========================================

export const subscribeStories = (cb: (stories: Story[]) => void) => {
  const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'), limit(20));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Story));
    cb(items);
  }, (e) => console.error('stories error:', e));
};
