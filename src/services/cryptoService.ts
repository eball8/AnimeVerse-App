import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const PBKDF2_ITERATIONS = 250000;
const textEnc = new TextEncoder();
const textDec = new TextDecoder();

// ---------- Base64 ----------
export const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
};

export const fromB64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// ---------- التخزين المحلي للمفتاح الخاص (IndexedDB) ----------
export interface LocalKey {
  uid: string;
  keyId: string;
  pub: string;
  privateKey: CryptoKey;
  pendingCode?: string;
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open('animeverse_e2ee', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys', { keyPath: 'uid' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export const getLocalKey = async (uid: string): Promise<LocalKey | null> => {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const req = d.transaction('keys', 'readonly').objectStore('keys').get(uid);
    req.onsuccess = () => resolve((req.result as LocalKey) || null);
    req.onerror = () => reject(req.error);
  });
};

const putLocalKey = async (rec: LocalKey): Promise<void> => {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ---------- كود الاسترجاع والنسخة الاحتياطية ----------
const makeRecoveryCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let s = '';
  bytes.forEach((b) => {
    s += alphabet[b & 31];
  });
  return s.match(/.{5}/g)!.join('-');
};

const deriveBackupKey = async (code: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> => {
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = await crypto.subtle.importKey('raw', textEnc.encode(norm), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const keyIdOf = async (pubRaw: Uint8Array): Promise<string> => {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', pubRaw));
  return Array.from(h.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const createAndPublish = async (uid: string): Promise<string> => {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const keyId = await keyIdOf(pubRaw);
  const pub = toB64(pubRaw);
  const code = makeRecoveryCode();

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bk = await deriveBackupKey(code, salt, PBKDF2_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, bk, pkcs8);

  // نخزّن على الجهاز نسخة غير قابلة للتصدير
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']);

  await setDoc(doc(db, 'publicKeys', uid), { keyId, publicKey: pub, updatedAt: serverTimestamp() });
  await setDoc(doc(db, 'keyBackups', uid), {
    keyId,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ct),
    iterations: PBKDF2_ITERATIONS,
    updatedAt: serverTimestamp(),
  });
  await putLocalKey({ uid, keyId, pub, privateKey, pendingCode: code });
  return code;
};

// ---------- حالة التشفير للمستخدم ----------
export interface E2EEInit {
  state: 'ready' | 'restore';
  pendingCode?: string;
}

const runInit = async (uid: string): Promise<E2EEInit> => {
  const local = await getLocalKey(uid);
  const pubSnap = await getDoc(doc(db, 'publicKeys', uid));

  if (local) {
    if (!pubSnap.exists()) {
      await setDoc(doc(db, 'publicKeys', uid), {
        keyId: local.keyId,
        publicKey: local.pub,
        updatedAt: serverTimestamp(),
      });
      return { state: 'ready', pendingCode: local.pendingCode };
    }
    if ((pubSnap.data() as any).keyId !== local.keyId) return { state: 'restore' };
    return { state: 'ready', pendingCode: local.pendingCode };
  }

  if (pubSnap.exists()) return { state: 'restore' };
  const code = await createAndPublish(uid);
  return { state: 'ready', pendingCode: code };
};

const initPromises = new Map<string, Promise<E2EEInit>>();

export const initE2EE = (uid: string): Promise<E2EEInit> => {
  const existing = initPromises.get(uid);
  if (existing) return existing;
  const p = runInit(uid).finally(() => {
    initPromises.delete(uid);
  });
  initPromises.set(uid, p);
  return p;
};

export const restoreKeys = async (uid: string, code: string): Promise<void> => {
  const [bSnap, pSnap] = await Promise.all([
    getDoc(doc(db, 'keyBackups', uid)),
    getDoc(doc(db, 'publicKeys', uid)),
  ]);
  if (!bSnap.exists() || !pSnap.exists()) throw new Error('NO_BACKUP');
  const b = bSnap.data() as any;
  const p = pSnap.data() as any;
  if (b.keyId !== p.keyId) throw new Error('NO_BACKUP');
  try {
    const key = await deriveBackupKey(code, fromB64(b.salt), b.iterations);
    const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(b.iv) }, key, fromB64(b.ciphertext));
    const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']);
    await putLocalKey({ uid, keyId: p.keyId, pub: p.publicKey, privateKey });
  } catch {
    throw new Error('BAD_CODE');
  }
};

export const resetKeys = (uid: string): Promise<string> => createAndPublish(uid);

export const clearPendingCode = async (uid: string): Promise<void> => {
  const rec = await getLocalKey(uid);
  if (!rec || !rec.pendingCode) return;
  const next: LocalKey = { uid: rec.uid, keyId: rec.keyId, pub: rec.pub, privateKey: rec.privateKey };
  await putLocalKey(next);
};

// ---------- تشفير الرسائل ----------
const sharedCache = new Map<string, CryptoKey>();

export const getSharedKey = async (
  priv: CryptoKey,
  myKeyId: string,
  theirKeyId: string,
  theirPubB64: string
): Promise<CryptoKey> => {
  const ck = `${myKeyId}:${theirKeyId}`;
  const hit = sharedCache.get(ck);
  if (hit) return hit;
  const pub = await crypto.subtle.importKey('raw', fromB64(theirPubB64), ECDH, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: textEnc.encode('animeverse-e2ee-v1') },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  sharedCache.set(ck, key);
  return key;
};

export const encryptJson = async (key: CryptoKey, data: unknown): Promise<{ ciphertext: string; iv: string }> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEnc.encode(JSON.stringify(data)));
  return { ciphertext: toB64(ct), iv: toB64(iv) };
};

export const decryptJson = async (key: CryptoKey, ciphertext: string, iv: string): Promise<any> => {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
  return JSON.parse(textDec.decode(pt));
};

// ---------- تشفير الملفات الصوتية ----------
export const encryptBlob = async (blob: Blob): Promise<{ data: Blob; key: string; iv: string }> => {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  return { data: new Blob([ct], { type: 'application/octet-stream' }), key: toB64(raw), iv: toB64(iv) };
};

export const decryptBlob = async (
  buf: ArrayBuffer,
  keyB64: string,
  ivB64: string,
  mime: string
): Promise<Blob> => {
  const key = await crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, buf);
  return new Blob([pt], { type: mime });
};
