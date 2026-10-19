import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
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
  // المفتاح الخاص (pkcs8 بصيغة Base64) يبقى مؤقتاً حتى يختار المستخدم كود PIN ثم يُحذف.
  pendingPkcs8?: string;
  // حقل قديم (كود الاسترجاع العشوائي السابق) يُستخدم فقط لترحيل الحسابات القديمة.
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

// ---------- كود الأمان PIN ----------
export const PIN_LENGTH = 6;
// الكود القديم العشوائي كان يستخدم 250000 تكرار، وكود PIN الجديد يستخدم عدداً مختلفاً.
// نستفيد من هذا الفرق لمعرفة نوع النسخة الاحتياطية دون تغيير قواعد Firestore.
export const PIN_ITERATIONS = 600000;

export const sanitizePin = (v: string): string => v.replace(/\D/g, '').slice(0, PIN_LENGTH);

export type PinCheck = 'ok' | 'invalid' | 'weak';

export const checkPin = (pin: string): PinCheck => {
  if (!/^\d{6}$/.test(pin)) return 'invalid';
  const d = pin.split('').map(Number);
  if (d.every((x) => x === d[0])) return 'weak';
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'weak';
  return 'ok';
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

// ---------- محاولات الإدخال الخاطئة (حماية على مستوى الجهاز فقط) ----------
const FAIL_KEY = (uid: string) => `av_pin_fail_${uid}`;
const FREE_ATTEMPTS = 5;

interface FailState {
  n: number;
  until: number;
}

const readFails = (uid: string): FailState => {
  try {
    const raw = localStorage.getItem(FAIL_KEY(uid));
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.n === 'number' && typeof p.until === 'number') return p;
    }
  } catch {
    // نتجاهل أخطاء التخزين
  }
  return { n: 0, until: 0 };
};

const writeFails = (uid: string, s: FailState): void => {
  try {
    if (s.n === 0) localStorage.removeItem(FAIL_KEY(uid));
    else localStorage.setItem(FAIL_KEY(uid), JSON.stringify(s));
  } catch {
    // نتجاهل أخطاء التخزين
  }
};

export interface PinLockInfo {
  lockedSeconds: number;
  attemptsLeft: number;
}

export const getPinLock = (uid: string): PinLockInfo => {
  const s = readFails(uid);
  const lockedSeconds = Math.max(0, Math.ceil((s.until - Date.now()) / 1000));
  return { lockedSeconds, attemptsLeft: Math.max(0, FREE_ATTEMPTS - (s.n % FREE_ATTEMPTS)) };
};

const registerFail = (uid: string): void => {
  const s = readFails(uid);
  const n = s.n + 1;
  let until = s.until;
  if (n % FREE_ATTEMPTS === 0) {
    const round = n / FREE_ATTEMPTS; // 1,2,3...
    const seconds = Math.min(30 * 2 ** (round - 1), 900);
    until = Date.now() + seconds * 1000;
  }
  writeFails(uid, { n, until });
};

const clearFails = (uid: string): void => writeFails(uid, { n: 0, until: 0 });

// ---------- إنشاء المفاتيح والنسخة الاحتياطية ----------
const writeBackup = async (uid: string, keyId: string, pkcs8: BufferSource, pin: string): Promise<void> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bk = await deriveBackupKey(pin, salt, PIN_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, bk, pkcs8);
  await setDoc(doc(db, 'keyBackups', uid), {
    keyId,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ct),
    iterations: PIN_ITERATIONS,
    updatedAt: serverTimestamp(),
  });
};

// ينشئ زوج مفاتيح جديداً وينشر المفتاح العام فقط. لا توجد نسخة احتياطية حتى يختار المستخدم PIN.
const createLocalKey = async (uid: string): Promise<LocalKey> => {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const keyId = await keyIdOf(pubRaw);
  const pub = toB64(pubRaw);
  // نخزّن على الجهاز نسخة غير قابلة للتصدير
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']);
  const rec: LocalKey = { uid, keyId, pub, privateKey, pendingPkcs8: toB64(pkcs8) };

  // نحفظ محلياً أولاً: إن فشل النشر لاحقاً تعيد التهيئة نشر المفتاح العام تلقائياً.
  await putLocalKey(rec);
  await setDoc(doc(db, 'publicKeys', uid), { keyId, publicKey: pub, updatedAt: serverTimestamp() });
  return rec;
};

// ---------- حالة التشفير للمستخدم ----------
// setup   : مفاتيح موجودة على هذا الجهاز لكن لا يوجد PIN بعد
// migrate : حساب قديم بكود استرجاع عشوائي، ولا يمكن تصدير مفتاحه المحلي، فيلزم الكود القديم مرة واحدة
// restore : جهاز جديد أو بيانات ممسوحة، يلزم إدخال PIN (أو الكود القديم إن كانت النسخة قديمة)
// reset   : لا توجد نسخة احتياطية صالحة، الحل الوحيد إنشاء PIN جديد ومسح الرسائل القديمة
export interface E2EEInit {
  state: 'ready' | 'setup' | 'migrate' | 'restore' | 'reset';
  legacy?: boolean;
}

interface PubDoc {
  keyId: string;
  publicKey: string;
}

interface BackupDoc {
  keyId: string;
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
}

const runInit = async (uid: string): Promise<E2EEInit> => {
  const local = await getLocalKey(uid);
  const [pubSnap, bSnap] = await Promise.all([
    getDoc(doc(db, 'publicKeys', uid)),
    getDoc(doc(db, 'keyBackups', uid)),
  ]);
  let pub = pubSnap.exists() ? (pubSnap.data() as PubDoc) : null;
  const backup = bSnap.exists() ? (bSnap.data() as BackupDoc) : null;

  if (local) {
    if (!pub) {
      await setDoc(doc(db, 'publicKeys', uid), {
        keyId: local.keyId,
        publicKey: local.pub,
        updatedAt: serverTimestamp(),
      });
      pub = { keyId: local.keyId, publicKey: local.pub };
    }
    const backupOfServerKey = !!backup && backup.keyId === pub.keyId;

    // مفتاح هذا الجهاز قديم لأن المفاتيح أُعيد إنشاؤها من جهاز آخر
    if (pub.keyId !== local.keyId) {
      if (!backupOfServerKey) return { state: 'reset' };
      return { state: 'restore', legacy: backup!.iterations !== PIN_ITERATIONS };
    }

    const backupOfLocalKey = !!backup && backup.keyId === local.keyId;
    if (backupOfLocalKey && backup!.iterations === PIN_ITERATIONS) return { state: 'ready' };

    if (local.pendingPkcs8) return { state: 'setup' };

    // حساب قديم: إن كان الكود القديم ما زال محفوظاً على الجهاز نحوّله تلقائياً دون سؤال المستخدم
    if (backupOfLocalKey && local.pendingCode) {
      try {
        const pkcs8 = await decryptBackup(backup!, local.pendingCode);
        await putLocalKey({
          uid: local.uid,
          keyId: local.keyId,
          pub: local.pub,
          privateKey: local.privateKey,
          pendingPkcs8: toB64(pkcs8),
        });
        return { state: 'setup' };
      } catch {
        // نكمل إلى مسار الترحيل اليدوي
      }
    }
    if (backupOfLocalKey) return { state: 'migrate' };
    return { state: 'reset' };
  }

  if (!pub) {
    await createLocalKey(uid);
    return { state: 'setup' };
  }
  if (backup && backup.keyId === pub.keyId) {
    return { state: 'restore', legacy: backup.iterations !== PIN_ITERATIONS };
  }
  return { state: 'reset' };
};

const decryptBackup = async (b: BackupDoc, code: string): Promise<ArrayBuffer> => {
  const key = await deriveBackupKey(code, fromB64(b.salt), b.iterations);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(b.iv) }, key, fromB64(b.ciphertext));
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

// يحفظ PIN لأول مرة (أو يرحّل حساباً قديماً باستخدام الكود القديم)
export const setupPin = async (uid: string, pin: string, legacyCode?: string): Promise<void> => {
  if (checkPin(pin) !== 'ok') throw new Error('BAD_PIN');
  const local = await getLocalKey(uid);
  if (!local) throw new Error('NO_LOCAL_KEY');

  let pkcs8: BufferSource;
  if (local.pendingPkcs8) {
    pkcs8 = fromB64(local.pendingPkcs8);
  } else {
    if (!legacyCode) throw new Error('BAD_CODE');
    if (getPinLock(uid).lockedSeconds > 0) throw new Error('LOCKED');
    const bSnap = await getDoc(doc(db, 'keyBackups', uid));
    if (!bSnap.exists()) throw new Error('NO_BACKUP');
    const b = bSnap.data() as BackupDoc;
    if (b.keyId !== local.keyId) throw new Error('NO_BACKUP');
    try {
      pkcs8 = await decryptBackup(b, legacyCode);
    } catch {
      registerFail(uid);
      throw new Error('BAD_CODE');
    }
    clearFails(uid);
  }

  await writeBackup(uid, local.keyId, pkcs8, pin);
  // نحذف المفتاح المؤقت وكود الاسترجاع القديم من الجهاز
  await putLocalKey({ uid: local.uid, keyId: local.keyId, pub: local.pub, privateKey: local.privateKey });
};

// استرجاع المفاتيح على جهاز جديد أو بعد مسح البيانات: PIN من 6 أرقام (أو الكود القديم لحسابات قديمة)
export const restoreKeys = async (uid: string, code: string): Promise<void> => {
  if (getPinLock(uid).lockedSeconds > 0) throw new Error('LOCKED');
  const [bSnap, pSnap] = await Promise.all([
    getDoc(doc(db, 'keyBackups', uid)),
    getDoc(doc(db, 'publicKeys', uid)),
  ]);
  if (!bSnap.exists() || !pSnap.exists()) throw new Error('NO_BACKUP');
  const b = bSnap.data() as BackupDoc;
  const p = pSnap.data() as PubDoc;
  if (b.keyId !== p.keyId) throw new Error('NO_BACKUP');
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await decryptBackup(b, code);
  } catch {
    registerFail(uid);
    throw new Error('BAD_CODE');
  }
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']);
  clearFails(uid);
  if (b.iterations === PIN_ITERATIONS) {
    await putLocalKey({ uid, keyId: p.keyId, pub: p.publicKey, privateKey });
  } else {
    // نسخة قديمة: نحتفظ بالمفتاح مؤقتاً ليختار المستخدم PIN جديداً
    await putLocalKey({ uid, keyId: p.keyId, pub: p.publicKey, privateKey, pendingPkcs8: toB64(pkcs8) });
  }
};

// حذف رسائلي المشفّرة القديمة. رسائل الطرف الآخر لا تسمح قواعد Firestore بحذفها من جهازي،
// لكنها تصبح غير قابلة لفك التشفير نهائياً لأن المفتاح القديم أُتلف.
const wipeMyMessages = async (uid: string): Promise<void> => {
  const convs = await getDocs(query(collection(db, 'conversations'), where('members', 'array-contains', uid)));
  for (const c of convs.docs) {
    const mine = await getDocs(query(collection(db, 'conversations', c.id, 'messages'), where('senderId', '==', uid)));
    for (let i = 0; i < mine.docs.length; i += 400) {
      const batch = writeBatch(db);
      mine.docs.slice(i, i + 400).forEach((m) => batch.delete(m.ref));
      await batch.commit();
    }
  }
};

// نسيان الكود: إنشاء مفاتيح جديدة بـ PIN جديد ومسح الرسائل القديمة
export const resetKeysWithPin = async (uid: string, pin: string): Promise<void> => {
  if (checkPin(pin) !== 'ok') throw new Error('BAD_PIN');
  const rec = await createLocalKey(uid);
  await writeBackup(uid, rec.keyId, fromB64(rec.pendingPkcs8!), pin);
  await putLocalKey({ uid, keyId: rec.keyId, pub: rec.pub, privateKey: rec.privateKey });
  clearFails(uid);
  try {
    await wipeMyMessages(uid);
  } catch (e) {
    // الرسائل القديمة غير قابلة للقراءة أصلاً بعد تغيير المفتاح، فلا نفشل العملية بسبب ذلك
    console.error('wipe old messages failed:', e);
  }
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
  
  // التعديل الهندسي: إجبار نوع الملف على أن يكون text/plain
  // هذا يمنع المتصفح من إعطائه امتداد .bin الذي يرفضه Cloudinary
  // التشفير نفسه لم يتغير ولن يتأثر
  return { 
    data: new Blob([ct], { type: 'text/plain' }), 
    key: toB64(raw), 
    iv: toB64(iv) 
  };
};

export const decryptBlob = async (
  buf: ArrayBuffer,
  keyB64: string,
  ivB64: string,
  mime: string
): Promise<Blob> => {
  const key = await crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, buf);
  // هنا نقوم بإرجاع الملف بالـ MIME الأصلي الذي تم تمريره (صوت/صورة/فيديو) لكي يعمل المشغل بشكل صحيح
  return new Blob([pt], { type: mime });
};
