import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  collection,
  where,
  getDocs,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { tr } from '../i18n/staticT';
import type { UserProfile } from '../types';
import { isValidUsername } from '../utils/username';

const USERS_COLLECTION = 'users';
const USERNAMES_COLLECTION = 'usernames';

const removeUndefined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

const takenError = () => {
  const e: any = new Error(tr('misc.usernameTaken'));
  e.code = 'app/username-taken';
  return e;
};

const pickAutoUsername = async (uid: string): Promise<string> => {
  const base = uid.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const n of [8, 12, 16, 20, 24]) {
    const cand = `user_${base.slice(0, n)}`;
    if (!isValidUsername(cand)) continue;
    const snap = await getDoc(doc(db, USERNAMES_COLLECTION, cand));
    if (!snap.exists() || snap.data().uid === uid) return cand;
  }
  return `user_${base.slice(0, 24)}`;
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  return snap.exists() ? ({ uid, ...snap.data() } as UserProfile) : null;
};

export const createUserProfile = async (
  uid: string,
  data: Partial<UserProfile>
): Promise<UserProfile> => {
  const now = serverTimestamp() as Timestamp;

  const requested = (data.username || '').trim().toLowerCase();
  const username =
    requested && isValidUsername(requested) ? requested : await pickAutoUsername(uid);

  const claimRef = doc(db, USERNAMES_COLLECTION, username);
  const claimSnap = await getDoc(claimRef);
  let needsClaim = true;
  if (claimSnap.exists()) {
    if (claimSnap.data().uid !== uid) throw takenError();
    needsClaim = false;
  }

  const profile: Omit<UserProfile, 'uid'> = {
    username,
    displayName: data.displayName || tr('misc.defaultUser'),
    firstName: data.firstName,
    lastName: data.lastName,
    photoURL: data.photoURL,
    bio: '',
    gender: data.gender,
    birthDate: data.birthDate,
    age: data.age,
    role: 'user',
    accountType: 'public',
    isVerified: false,
    isEmailVerified: false,
    isBanned: false,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    preferredLanguage: 'ar',
    themePreference: 'dark',
    createdAt: now,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  if (needsClaim) {
    batch.set(claimRef, { uid, createdAt: serverTimestamp() });
  }
  batch.set(doc(db, USERS_COLLECTION, uid), removeUndefined(profile));
  try {
    await batch.commit();
  } catch (e: any) {
    if (needsClaim && e?.code === 'permission-denied') {
      const again = await getDoc(claimRef).catch(() => null);
      if (again && again.exists() && again.data().uid !== uid) throw takenError();
    }
    throw e;
  }

  if (data.email) {
    try {
      await setDoc(doc(db, 'userPrivate', uid), {
        email: data.email,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('userPrivate write failed:', e);
    }
  }
  return { uid, email: data.email, ...profile };
};

export const updateUserProfile = async (
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> => {
  const clean = removeUndefined(updates);
  const userRef = doc(db, USERS_COLLECTION, uid);

  if (typeof clean.username !== 'string') {
    await updateDoc(userRef, { ...clean, updatedAt: serverTimestamp() });
    return;
  }

  const newName = clean.username.trim().toLowerCase();
  const cur = await getDoc(userRef);
  const oldName = cur.exists() ? String(cur.data().username || '') : '';

  if (newName === oldName) {
    await updateDoc(userRef, { ...clean, username: newName, updatedAt: serverTimestamp() });
    return;
  }

  if (!isValidUsername(newName)) {
    const e: any = new Error(tr('ep.usernameError'));
    e.code = 'app/username-invalid';
    throw e;
  }

  const newRef = doc(db, USERNAMES_COLLECTION, newName);
  const newSnap = await getDoc(newRef);
  if (newSnap.exists() && newSnap.data().uid !== uid) throw takenError();

  const batch = writeBatch(db);
  if (!newSnap.exists()) {
    batch.set(newRef, { uid, createdAt: serverTimestamp() });
  }
  if (oldName && isValidUsername(oldName)) {
    const oldRef = doc(db, USERNAMES_COLLECTION, oldName);
    const oldSnap = await getDoc(oldRef);
    if (oldSnap.exists() && oldSnap.data().uid === uid) batch.delete(oldRef);
  }
  batch.update(userRef, { ...clean, username: newName, updatedAt: serverTimestamp() });

  try {
    await batch.commit();
  } catch (e: any) {
    if (e?.code === 'permission-denied') {
      const again = await getDoc(newRef).catch(() => null);
      if (again && again.exists() && again.data().uid !== uid) throw takenError();
    }
    throw e;
  }
};

export const ensureUsernameClaim = async (uid: string, username: string): Promise<void> => {
  const uname = (username || '').trim().toLowerCase();
  if (uname !== username || !isValidUsername(uname)) return;
  const ref = doc(db, USERNAMES_COLLECTION, uname);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, { uid, createdAt: serverTimestamp() });
};

export const checkUsernameAvailable = async (
  username: string,
  excludeUid?: string
): Promise<boolean> => {
  const uname = username.trim().toLowerCase();
  if (!isValidUsername(uname)) return false;

  const claim = await getDoc(doc(db, USERNAMES_COLLECTION, uname));
  if (claim.exists() && claim.data().uid !== excludeUid) return false;

  const q = query(
    collection(db, USERS_COLLECTION),
    where('username', '==', uname)
  );
  const snap = await getDocs(q);
  if (snap.empty) return true;
  return snap.docs.every((d) => d.id === excludeUid);
};
