import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db, googleProvider } from '../config/firebase';
import { deviceLabel, getDeviceId } from './deviceService';

// ---------------- الأجهزة والثقة ----------------
// الجهاز الأول (الأقدم) موثوق مباشرة، وأي جهاز جديد يصبح موثوقاً بعد 3 أيام من تسجيله.
export const TRUST_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DeviceItem {
  id: string;
  label: string;
  platform: string;
  createdAt: number;
  current: boolean;
  trusted: boolean;
  daysLeft: number;
}

export const loadDevices = async (uid: string): Promise<DeviceItem[]> => {
  const snap = await getDocs(collection(db, 'userDevices', uid, 'items'));
  const currentId = getDeviceId();
  const now = Date.now();

  const raw = snap.docs
    .map((d) => {
      const x = d.data() as { label?: string; platform?: string; createdAt?: { toMillis?: () => number } };
      return {
        id: d.id,
        label: x.label || 'جهاز',
        platform: x.platform || 'android',
        createdAt: x.createdAt?.toMillis?.() ?? now,
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);

  const firstId = raw[0]?.id;

  return raw.map((d) => {
    const ageMs = now - d.createdAt;
    const trusted = d.id === firstId || ageMs >= TRUST_DAYS * DAY_MS;
    return {
      ...d,
      current: d.id === currentId,
      trusted,
      daysLeft: trusted ? 0 : Math.max(1, Math.ceil((TRUST_DAYS * DAY_MS - ageMs) / DAY_MS)),
    };
  });
};

// هل الجهاز الحالي موثوق؟ إن لم يكن مسجلاً بعد ولا توجد أجهزة أخرى نعتبره موثوقاً.
export const isCurrentTrusted = (devices: DeviceItem[]): boolean => {
  const cur = devices.find((d) => d.current);
  return cur ? cur.trusted : devices.length === 0;
};

export const registerThisDevice = async (uid: string): Promise<void> => {
  await setDoc(doc(db, 'userDevices', uid, 'items', getDeviceId()), {
    label: deviceLabel(),
    platform: /Android/i.test(navigator.userAgent) ? 'android' : 'web',
    createdAt: serverTimestamp(),
  });
};

export const removeDevice = async (uid: string, deviceId: string): Promise<void> => {
  if (deviceId === getDeviceId()) throw new Error('CURRENT_DEVICE');
  await deleteDoc(doc(db, 'userDevices', uid, 'items', deviceId));
};

// ---------------- طرق تسجيل الدخول ----------------
export const hasProvider = (user: User, providerId: 'google.com' | 'password'): boolean =>
  user.providerData.some((p) => p.providerId === providerId);

export const reauthGoogle = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('no-user');
  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
      useCredentialManager: false,
    } as any);
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('NO_ID_TOKEN');
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken));
  } else {
    await reauthenticateWithPopup(user, googleProvider);
  }
};

// إضافة البريد وكلمة السر لحساب مسجّل بجوجل
export const addEmailPassword = async (email: string, password: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('no-user');
  const cred = EmailAuthProvider.credential(email, password);
  try {
    await linkWithCredential(user, cred);
  } catch (e: any) {
    if (e?.code !== 'auth/requires-recent-login') throw e;
    await reauthGoogle();
    await linkWithCredential(user, cred);
  }
};

export const changePassword = async (current: string, next: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('no-user');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
};

export const authErrorText = (e: any): string => {
  const code = String(e?.code ?? e?.message ?? '');
  if (/wrong-password|invalid-credential|invalid-login/.test(code)) return 'كلمة السر الحالية غير صحيحة.';
  if (/weak-password/.test(code)) return 'كلمة السر ضعيفة، استخدم 6 أحرف أو أكثر.';
  if (/email-already-in-use|credential-already-in-use/.test(code)) return 'هذا البريد مرتبط بحساب آخر.';
  if (/provider-already-linked/.test(code)) return 'هذه الطريقة مضافة مسبقاً.';
  if (/user-mismatch/.test(code)) return 'سجّل بنفس حساب جوجل المرتبط بهذا الحساب.';
  if (/too-many-requests/.test(code)) return 'محاولات كثيرة، حاول لاحقاً.';
  if (/network/.test(code)) return 'تحقق من اتصالك بالإنترنت.';
  if (/cancel|12501|12502|popup-closed/i.test(code)) return 'تم إلغاء العملية.';
  if (/requires-recent-login/.test(code)) return 'سجّل الدخول مرة أخرى ثم أعد المحاولة.';
  return 'حدث خطأ، حاول مرة أخرى.';
};

// ---------------- المشغل الافتراضي ----------------
export type PlayerPref = 'ezv' | 'browser';
const PLAYER_KEY = 'av_player_pref';

export const getPlayerPref = (): PlayerPref => {
  try {
    return localStorage.getItem(PLAYER_KEY) === 'browser' ? 'browser' : 'ezv';
  } catch {
    return 'ezv';
  }
};

export const setPlayerPref = (p: PlayerPref): void => {
  try {
    localStorage.setItem(PLAYER_KEY, p);
  } catch {
    // لا يؤثر على عمل التطبيق
  }
};

// ---------------- الإبلاغ عن مشكلة ----------------
export const sendProblemReport = async (text: string, version: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('no-user');
  const header = `[v${version} | ${deviceLabel()}] `;
  const reason = (header + text.trim()).slice(0, 500);
  await setDoc(doc(collection(db, 'reports')), {
    type: 'bug',
    targetId: 'app',
    targetType: 'app',
    reporterUid: user.uid,
    reason,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
};
