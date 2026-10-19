import {
  addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, arrayUnion, arrayRemove, FieldPath
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { decryptJson, encryptJson, fromB64, getLocalKey, getSharedKey, toB64 } from './cryptoService';
import type { LocalKey } from './cryptoService';

// ---------------------------------------------------------------
// أنواع الرسائل. الحقل f = رسالة معاد توجيهها
// ---------------------------------------------------------------
type PayloadBase =
  | { k: 't'; v: string }
  | { k: 'v'; url: string; key: string; iv: string; dur: number; mime: string }
  | { k: 'm'; url: string; key: string; iv: string; mime: string; size: number; w?: number; h?: number };

export type ChatPayload = PayloadBase & { f?: 1 };

export interface Conversation {
  id: string;
  otherUid: string; // للمحادثات الفردية فقط
  lastMessageAt: any;
  lastMessageBy?: string;
  reads?: Record<string, any>;
  theme?: string;
  type?: 'direct' | 'group';
  name?: string;
  members?: string[];
  admins?: string[];
  photoURL?: string;
}

export interface WrappedKey { c: string; i: string; }

export interface RawMessage {
  id: string;
  senderId: string;
  ciphertext: string;
  iv: string;
  senderKeyId: string;
  recipientKeyId: string;
  createdAt: any;
  replyTo?: string;
  reactions?: Record<string, string[]>;
  wraps?: Record<string, WrappedKey>; // رسائل المجموعات فقط
}

export interface PublicKeyInfo {
  keyId: string;
  publicKey: string;
}

export const convIdOf = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

// ---------------------------------------------------------------
// المحادثات
// ---------------------------------------------------------------
export const subscribeConversations = (me: string, cb: (items: Conversation[]) => void) => {
  const q = query(collection(db, 'conversations'), where('members', 'array-contains', me), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data() as any;
        const isGroup = data.type === 'group';
        const other = isGroup ? '' : ((data.members as string[]) || []).find((m) => m !== me) || '';
        return {
          id: d.id,
          otherUid: other,
          lastMessageAt: data.lastMessageAt,
          lastMessageBy: data.lastMessageBy,
          reads: data.reads,
          theme: data.theme,
          type: data.type || 'direct',
          name: data.name,
          members: data.members,
          admins: data.admins,
          photoURL: data.photoURL,
        } as Conversation;
      });
      const t = (c: Conversation) => c.lastMessageAt?.toMillis?.() ?? Date.now();
      items.sort((a, b) => t(b) - t(a));
      cb(items);
    },
    (e) => console.error('conversations error:', e)
  );
};

// هل في المحادثة رسائل جديدة لم أقرأها؟
export const isUnread = (c: Conversation, me: string): boolean => {
  if (!c.lastMessageBy || c.lastMessageBy === me) return false;
  const last = c.lastMessageAt?.toMillis?.();
  if (!last) return false;
  const read = c.reads?.[me]?.toMillis?.() ?? 0;
  return last > read;
};

export const markConversationRead = async (convId: string, me: string): Promise<void> => {
  await updateDoc(doc(db, 'conversations', convId), new FieldPath('reads', me), serverTimestamp());
};

export const setConversationTheme = async (convId: string, theme: string): Promise<void> => {
  await updateDoc(doc(db, 'conversations', convId), { theme });
};

// ---------------------------------------------------------------
// مفاتيح التشفير العامة
// ---------------------------------------------------------------
export const getPublicKeyInfo = async (uid: string): Promise<PublicKeyInfo | null> => {
  const snap = await getDoc(doc(db, 'publicKeys', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return { keyId: d.keyId, publicKey: d.publicKey };
};

const keyCache = new Map<string, { t: number; v: PublicKeyInfo | null }>();
const getPublicKeyInfoCached = async (uid: string): Promise<PublicKeyInfo | null> => {
  const hit = keyCache.get(uid);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  const v = await getPublicKeyInfo(uid);
  keyCache.set(uid, { t: Date.now(), v });
  return v;
};

// ---------------------------------------------------------------
// الاشتراك في الرسائل
// ---------------------------------------------------------------
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

const assertCanMessage = async (me: string, other: string): Promise<void> => {
  const snap = await getDoc(doc(db, 'users', other));
  const mode = (snap.data() as { messagePrivacy?: string } | undefined)?.messagePrivacy;
  if (mode === 'nobody') throw new Error('MESSAGES_CLOSED');
  if (mode === 'following') {
    const f = await getDoc(doc(db, 'follows', `${other}_${me}`));
    if (!f.exists()) throw new Error('MESSAGES_CLOSED');
  }
};

const touchConversation = async (convId: string, me: string): Promise<void> => {
  await updateDoc(doc(db, 'conversations', convId), {
    lastMessageAt: serverTimestamp(),
    lastMessageBy: me,
  });
};

// ---------------------------------------------------------------
// إرسال رسالة في محادثة فردية
// otherUid = معرّف المستخدم الآخر (وليس معرّف المحادثة!)
// ---------------------------------------------------------------
export const sendDirect = async (
  me: string,
  otherUid: string,
  payload: ChatPayload,
  conversationAlreadyExists: boolean,
  replyTo?: string
): Promise<void> => {
  const local = await getLocalKey(me);
  if (!local) throw new Error('NO_LOCAL_KEY');

  const theirKey = await getPublicKeyInfo(otherUid);
  if (!theirKey) throw new Error('RECIPIENT_NO_KEY');

  const shared = await getSharedKey(local.privateKey, local.keyId, theirKey.keyId, theirKey.publicKey);
  const { ciphertext, iv } = await encryptJson(shared, payload);
  const convId = convIdOf(me, otherUid);

  if (!conversationAlreadyExists) {
    await assertCanMessage(me, otherUid);
    await setDoc(doc(db, 'conversations', convId), {
      members: [me, otherUid].sort(),
      type: 'direct',
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageBy: me,
    });
  }

  const msgData: any = {
    senderId: me,
    ciphertext,
    iv,
    senderKeyId: local.keyId,
    recipientKeyId: theirKey.keyId,
    createdAt: serverTimestamp(),
  };
  if (replyTo) msgData.replyTo = replyTo;

  await addDoc(collection(db, 'conversations', convId, 'messages'), msgData);
  await touchConversation(convId, me);
};

// ---------------------------------------------------------------
// إرسال رسالة في مجموعة (تشفير حقيقي لكل عضو):
// نولّد مفتاحاً عشوائياً للرسالة، ونشفّر المحتوى به، ثم نشفّر هذا المفتاح
// لكل عضو بمفتاحه العام (ECDH). فقط الأعضاء يستطيعون القراءة.
// ---------------------------------------------------------------
export const sendGroup = async (
  me: string,
  groupId: string,
  members: string[],
  payload: ChatPayload,
  replyTo?: string
): Promise<void> => {
  const local = await getLocalKey(me);
  if (!local) throw new Error('NO_LOCAL_KEY');

  const mk = crypto.getRandomValues(new Uint8Array(32));
  const aes = await crypto.subtle.importKey('raw', mk, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aes,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const mkB64 = toB64(mk);

  const wraps: Record<string, WrappedKey> = {};
  await Promise.all(
    Array.from(new Set([...members, me])).map(async (uid) => {
      try {
        const info: PublicKeyInfo | null =
          uid === me ? { keyId: local.keyId, publicKey: local.pub } : await getPublicKeyInfoCached(uid);
        if (!info) return; // عضو لم يفعّل التشفير بعد: لن يستطيع قراءة الرسالة
        const shared = await getSharedKey(local.privateKey, local.keyId, info.keyId, info.publicKey);
        const w = await encryptJson(shared, { k: mkB64 });
        wraps[uid] = { c: w.ciphertext, i: w.iv };
      } catch (e) {
        console.error('wrap key failed for', uid, e);
      }
    })
  );

  const msgData: any = {
    senderId: me,
    ciphertext: toB64(ct),
    iv: toB64(iv),
    senderKeyId: local.keyId,
    recipientKeyId: 'group-v1-wrapped',
    wraps,
    createdAt: serverTimestamp(),
  };
  if (replyTo) msgData.replyTo = replyTo;

  await addDoc(collection(db, 'conversations', groupId, 'messages'), msgData);
  await touchConversation(groupId, me);
};

// ---------------------------------------------------------------
// فك التشفير
// ---------------------------------------------------------------
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

export const decryptGroupMessage = async (
  me: string,
  local: LocalKey,
  m: RawMessage
): Promise<ChatPayload | null> => {
  try {
    const w = m.wraps?.[me];
    if (!w) return null;
    const mine = m.senderId === me;
    const sender: PublicKeyInfo | null = mine
      ? { keyId: local.keyId, publicKey: local.pub }
      : await getPublicKeyInfoCached(m.senderId);
    if (!sender || sender.keyId !== m.senderKeyId) return null;
    const shared = await getSharedKey(local.privateKey, local.keyId, sender.keyId, sender.publicKey);
    const { k } = (await decryptJson(shared, w.c, w.i)) as { k: string };
    const aes = await crypto.subtle.importKey('raw', fromB64(k), 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(m.iv) }, aes, fromB64(m.ciphertext));
    return JSON.parse(new TextDecoder().decode(pt)) as ChatPayload;
  } catch {
    return null;
  }
};

export const removeMessage = async (convId: string, msgId: string): Promise<void> => {
  await deleteDoc(doc(db, 'conversations', convId, 'messages', msgId));
};

// ---------------------------------------------------------------
// التفاعل بالإيموجي (إضافة/إزالة تفاعلي أنا فقط)
// ---------------------------------------------------------------
export const toggleReaction = async (
  convId: string,
  msgId: string,
  emoji: string,
  uid: string,
  alreadyReacted: boolean
): Promise<void> => {
  await updateDoc(
    doc(db, 'conversations', convId, 'messages', msgId),
    new FieldPath('reactions', emoji),
    alreadyReacted ? arrayRemove(uid) : arrayUnion(uid)
  );
};

// ---------------------------------------------------------------
// إنشاء مجموعة
// ---------------------------------------------------------------
export const createGroup = async (me: string, groupName: string, memberUids: string[]): Promise<string> => {
  const allMembers = Array.from(new Set([me, ...memberUids]));
  const newGroupRef = doc(collection(db, 'conversations'));

  await setDoc(newGroupRef, {
    type: 'group',
    name: groupName,
    members: allMembers,
    admins: [me],
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
  });

  return newGroupRef.id;
};
