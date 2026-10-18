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
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile } from '../types';

const USERS_COLLECTION = 'users';

const removeUndefined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  return snap.exists() ? ({ uid, ...snap.data() } as UserProfile) : null;
};

export const createUserProfile = async (
  uid: string,
  data: Partial<UserProfile>
): Promise<UserProfile> => {
  const now = serverTimestamp() as Timestamp;

  const profile: Omit<UserProfile, 'uid'> = {
    email: data.email,
    username: data.username || `user_${uid.slice(0, 8)}`,
    displayName: data.displayName || 'مستخدم AnimeVerse',
    photoURL: data.photoURL,
    bio: '',
    gender: data.gender,
    age: data.age,
    role: 'user',
    accountType: 'public',
    isVerified: false,
    isBanned: false,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    preferredLanguage: 'ar',
    themePreference: 'dark',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, USERS_COLLECTION, uid), removeUndefined(profile));
  return { uid, ...profile };
};

export const updateUserProfile = async (
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> => {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    ...removeUndefined(updates),
    updatedAt: serverTimestamp(),
  });
};

export const checkUsernameAvailable = async (
  username: string,
  excludeUid?: string
): Promise<boolean> => {
  const q = query(
    collection(db, USERS_COLLECTION),
    where('username', '==', username.toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return true;
  return snap.docs.every((d) => d.id === excludeUid);
};
