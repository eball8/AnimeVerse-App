import { addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, arrayUnion, arrayRemove, FieldPath } from 'firebase/firestore';
import { db } from '../config/firebase';
import { decryptJson, encryptJson, fromB64, getLocalKey, getSharedKey, toB64 } from './cryptoService';
import type { LocalKey } from './cryptoService';
import { acceptMessageRequest, getChatPref } from './chatPrefsService';

type PayloadBase =
  | { k: 't'; v: string }
  | { k: 'v'; url: string; key: string; iv: string; dur: number; mime: string }
  | { k: 'm'; url: string; key: string; iv: string; mime: string; size: number; w?: number; h?: number };

export type ChatPayload = PayloadBase & { f?: 1 };

export interface Conversation {
  id: string;
  otherUid: string;
  lastMessageAt: any;
  lastMessageBy?: string;
  reads?: Record<string, any>;
  theme?: string;
  type?: 'direct' | 'group';
  name?: string;
  members?: string[];
  admins?: string[];
  photoURL?: string;
  disappearAfter?: number;
  pinned?: string[];
  starterId?: string;
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
  wraps?: Record<string, WrappedKey>;
  edited?: boolean;
}

export interface PublicKeyInfo {
  keyId: string;
  publicKey: string;
}

export const convIdOf = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

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
          disappearAfter: typeof data.disappearAfter === 'number' ? data.disappearAfter : 0,
          pinned: Array.isArray(data.pinned) ? (data.pinned as string[]) : [],
          starterId: typeof data.starterId === 'string' ? data.starterId : undefined,
        } as Conversation;
      });
      const t = (c: Conversation) => c.lastMessageAt?.toMillis?.() ?? Date.now();
      items.sort((a, b) => t(b) - t(a));
      cb(items);
    },
    (e) => console.error('conversations error:', e)
  );
};

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

export const DISAPPEAR_24H_MS = 24 * 60 * 60 * 1000;

export const setDisappearAfter = async (convId: string, ms: number): Promise<void> => {
  await updateDoc(doc(db, 'conversations', convId), { disappearAfter: Math.max(0, Math.floor(ms)) });
};

export const MAX_PINNED = 3;

export const setPinnedMessages = async (convId: string, ids: string[]): Promise<void> => {
  await updateDoc(doc(db, 'conversations', convId), { pinned: ids.slice(0, MAX_PINNED) });
};

export const isExpired = (m: Pick<RawMessage, 'createdAt'>, disappearAfter: number, now: number = Date.now()): boolean => {
  if (!disappearAfter || disappearAfter <= 0) return false;
  const created: number | undefined = m.createdAt?.toMillis?.();
  if (!created) return false;
  return now - created >= disappearAfter;
};

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

const starterCache = new Map<string, string | null>();
const getStarterId = async (convId: string): Promise<string | null> => {
  if (starterCache.has(convId)) return starterCache.get(convId) ?? null;
  const snap = await getDoc(doc(db, 'conversations', convId));
  const s = snap.exists() ? (snap.data() as { starterId?: string }).starterId : undefined;
  const v = typeof s === 'string' ? s : null;
  starterCache.set(convId, v);
  return v;
};

export type MessagePrivacy = 'everyone' | 'following' | 'nobody';

interface UserPrivacyDoc {
  messagePrivacy?: MessagePrivacy;
  accountType?: 'public' | 'private';
}

const getUserPrivacy = async (uid: string): Promise<UserPrivacyDoc> => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return {};
  const d = snap.data() as any;
  return {
    messagePrivacy: (d.messagePrivacy as MessagePrivacy) || 'everyone',
    accountType: (d.accountType as 'public' | 'private') || 'public',
  };
};

const isFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, 'follows', `${followerId}_${followingId}`));
  return snap.exists();
};

const assertCanMessage = async (me: string, other: string): Promise<void> => {
  const privacy = await getUserPrivacy(other);
  const mode = privacy.messagePrivacy ?? 'everyone';

  if (mode === 'nobody') throw new Error('MESSAGES_CLOSED');

  if (mode === 'following') {
    const otherFollowsMe = await isFollowing(other, me);
    if (!otherFollowsMe) throw new Error('MESSAGES_CLOSED');
  }
};

const assertExistingChatAllowed = async (me: string, other: string, convId: string): Promise<void> => {
  return; 
};

const autoAcceptRequest = async (me: string, convId: string): Promise<void> => {
  const key = `${me}_${convId}`;
  const acceptedThisSession = (autoAcceptRequest as any)._accepted || new Set<string>();
  (autoAcceptRequest as any)._accepted = acceptedThisSession;
  if (acceptedThisSession.has(key)) return;

  const starter = await getStarterId(convId);
  if (starter && starter !== me) {
    const cur = await getChatPref(me, convId);
    if (!cur?.accepted) await acceptMessageRequest(me, convId, cur);
  }
  acceptedThisSession.add(key);
};

const touchConversation = async (convId: string, me: string): Promise<void> => {
  await updateDoc(doc(db, 'conversations', convId), {
    lastMessageAt: serverTimestamp(),
    lastMessageBy: me,
  });
};

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
      starterId: me,
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageBy: me,
    });
    starterCache.set(convId, me);
  } else {
    await assertExistingChatAllowed(me, otherUid, convId);
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

  if (conversationAlreadyExists) {
    autoAcceptRequest(me, convId).catch((e) => console.error('autoAcceptRequest failed:', e));
  }
};

const encryptForGroup = async (
  me: string,
  local: LocalKey,
  members: string[],
  payload: ChatPayload
): Promise<{ ciphertext: string; iv: string; wraps: Record<string, WrappedKey> }> => {
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
        const info: PublicKeyInfo | null = uid === me
          ? { keyId: local.keyId, publicKey: local.pub }
          : await getPublicKeyInfoCached(uid);
        if (!info) return;
        const shared = await getSharedKey(local.privateKey, local.keyId, info.keyId, info.publicKey);
        const w = await encryptJson(shared, { k: mkB64 });
        wraps[uid] = { c: w.ciphertext, i: w.iv };
      } catch (e) {
        console.error('wrap key failed for', uid, e);
      }
    })
  );

  return { ciphertext: toB64(ct), iv: toB64(iv), wraps };
};

export const sendGroup = async (
  me: string,
  groupId: string,
  members: string[],
  payload: ChatPayload,
  replyTo?: string
): Promise<void> => {
  const local = await getLocalKey(me);
  if (!local) throw new Error('NO_LOCAL_KEY');

  const enc = await encryptForGroup(me, local, members, payload);

  const msgData: any = {
    senderId: me,
    ciphertext: enc.ciphertext,
    iv: enc.iv,
    senderKeyId: local.keyId,
    recipientKeyId: 'group-v1-wrapped',
    wraps: enc.wraps,
    createdAt: serverTimestamp(),
  };
  if (replyTo) msgData.replyTo = replyTo;

  await addDoc(collection(db, 'conversations', groupId, 'messages'), msgData);
  await touchConversation(groupId, me);
};

export const editDirect = async (
  me: string,
  otherUid: string,
  m: RawMessage,
  payload: ChatPayload
): Promise<void> => {
  if (m.senderId !== me) throw new Error('NOT_OWNER');
  const local = await getLocalKey(me);
  if (!local || local.keyId !== m.senderKeyId) throw new Error('NO_LOCAL_KEY');
  const theirKey = await getPublicKeyInfo(otherUid);
  if (!theirKey || theirKey.keyId !== m.recipientKeyId) throw new Error('KEY_CHANGED');

  const shared = await getSharedKey(local.privateKey, local.keyId, theirKey.keyId, theirKey.publicKey);
  const { ciphertext, iv } = await encryptJson(shared, payload);
  await updateDoc(doc(db, 'conversations', convIdOf(me, otherUid), 'messages', m.id), {
    ciphertext,
    iv,
    edited: true,
  });
};

export const editGroup = async (
  me: string,
  groupId: string,
  members: string[],
  m: RawMessage,
  payload: ChatPayload
): Promise<void> => {
  if (m.senderId !== me) throw new Error('NOT_OWNER');
  const local = await getLocalKey(me);
  if (!local || local.keyId !== m.senderKeyId) throw new Error('NO_LOCAL_KEY');

  const enc = await encryptForGroup(me, local, members, payload);
  await updateDoc(doc(db, 'conversations', groupId, 'messages', m.id), {
    ciphertext: enc.ciphertext,
    iv: enc.iv,
    wraps: enc.wraps,
    edited: true,
  });
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

export const subscribeBlockedIds = (me: string, cb: (ids: Set<string>) => void) => {
  const q = query(collection(db, 'blocks'), where('blockerId', '==', me), limit(500));
  return onSnapshot(
    q,
    (snap) => cb(new Set(snap.docs.map((d) => (d.data() as { blockedId: string }).blockedId))),
    (e) => console.error('blocks error:', e)
  );
};

export const blockUser = async (me: string, other: string): Promise<void> => {
  await setDoc(doc(db, 'blocks', `${me}_${other}`), {
    blockerId: me,
    blockedId: other,
    createdAt: serverTimestamp(),
  });
};

export const unblockUser = async (me: string, other: string): Promise<void> => {
  await deleteDoc(doc(db, 'blocks', `${me}_${other}`));
};

export type ReportKind = 'abuse' | 'spam';

export const reportUser = async (me: string, targetUid: string, kind: ReportKind, reason: string): Promise<void> => {
  const text = reason.trim().slice(0, 500);
  if (!text) throw new Error('EMPTY_REASON');
  await addDoc(collection(db, 'reports'), {
    type: kind,
    targetId: targetUid,
    targetType: 'user',
    reporterUid: me,
    reason: text,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
};
