import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  unlink,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import type { AuthCredential, User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db, googleProvider } from '../config/firebase';
import { tr } from '../i18n/staticT';
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
        label: x.label || tr('misc.device'),
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
type ProviderId = 'google.com' | 'password';

export const hasProvider = (user: User, providerId: ProviderId): boolean =>
  user.providerData.some((p) => p.providerId === providerId);

// البريد المرتبط بطريقة معيّنة (بريد جوجل أو بريد كلمة السر)
export const getProviderEmail = (user: User, providerId: ProviderId): string | null =>
  user.providerData.find((p) => p.providerId === providerId)?.email ?? null;

const appError = (code: string): Error => {
  const e: any = new Error(code);
  e.code = code;
  return e;
};

const currentUserOrThrow = (): User => {
  const user = auth.currentUser;
  if (!user) throw appError('app/no-user');
  return user;
};

// الأجهزة غير الموثوقة ممنوعة من أي تعديل على طرق الدخول (يُفحص هنا وليس في الواجهة فقط)
const assertTrusted = async (uid: string): Promise<void> => {
  let devices: DeviceItem[];
  try {
    devices = await loadDevices(uid);
  } catch {
    throw appError('app/trust-check-failed');
  }
  if (!isCurrentTrusted(devices)) throw appError('app/untrusted-device');
};

// استخراج البريد من idToken الخاص بجوجل (للمقارنة قبل الربط)
const emailFromIdToken = (token: string): string | null => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(part)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const mail = String(JSON.parse(json).email || '').toLowerCase();
    return mail || null;
  } catch {
    return null;
  }
};

// اختيار حساب جوجل على أندرويد بدون تسجيل دخول Firebase
const pickNativeGoogle = async (): Promise<{ cred: AuthCredential; email: string | null }> => {
  const result = await FirebaseAuthentication.signInWithGoogle({
    skipNativeAuth: true,
    useCredentialManager: false,
  } as any);
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('NO_ID_TOKEN');
  return { cred: GoogleAuthProvider.credential(idToken), email: emailFromIdToken(idToken) };
};

// إعادة التحقق بجوجل، وتُرجع بيانات الاعتماد لاستخدامها في التراجع عند الفشل
const reauthGoogleCred = async (user: User): Promise<AuthCredential | null> => {
  if (Capacitor.isNativePlatform()) {
    const { cred } = await pickNativeGoogle();
    await reauthenticateWithCredential(user, cred);
    return cred;
  }
  const res = await reauthenticateWithPopup(user, googleProvider);
  return GoogleAuthProvider.credentialFromResult(res);
};

export const reauthGoogle = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('no-user');
  await reauthGoogleCred(user);
};

const reauthPassword = async (user: User, password: string): Promise<void> => {
  const mail = getProviderEmail(user, 'password') || user.email;
  if (!mail) throw appError('app/need-email-method');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(mail, password));
};

// يحفظ البريد الحالي في userPrivate (حسب قواعد Firestore) إن اختلف عن المحفوظ
export const syncPrivateEmail = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await reload(user);
  } catch {
    // لا يؤثر
  }
  const email = (user.email || getProviderEmail(user, 'password') || getProviderEmail(user, 'google.com') || '')
    .trim()
    .toLowerCase();
  if (!email) return;
  const ref = doc(db, 'userPrivate', user.uid);
  const snap = await getDoc(ref).catch(() => null);
  if (snap?.exists() && String(snap.data().email || '').toLowerCase() === email) return;
  await setDoc(ref, { email, updatedAt: serverTimestamp() });
};

// ---- البريد وكلمة السر ----

// إضافة البريد وكلمة السر (لحساب مسجّل بجوجل). البريد يكتبه المستخدم حتى لو كان نفس بريد جوجل.
export const addEmailPassword = async (email: string, password: string): Promise<void> => {
  const user = currentUserOrThrow();
  await assertTrusted(user.uid);
  if (hasProvider(user, 'password')) throw { code: 'auth/provider-already-linked' };
  const cred = EmailAuthProvider.credential(email.trim().toLowerCase(), password);
  try {
    await linkWithCredential(user, cred);
  } catch (e: any) {
    if (e?.code !== 'auth/requires-recent-login') throw e;
    await reauthGoogle();
    await linkWithCredential(user, cred);
  }
  if (!user.emailVerified) sendEmailVerification(user).catch(() => undefined);
  await syncPrivateEmail().catch(() => undefined);
};

// تعديل البريد: يتطلب كلمة السر الحالية، ويُرسَل رابط تأكيد للبريد الجديد ولا يتغير قبل فتحه
export const changeEmail = async (currentPassword: string, newEmail: string): Promise<void> => {
  const user = currentUserOrThrow();
  await assertTrusted(user.uid);
  if (!hasProvider(user, 'password')) throw appError('app/need-email-method');
  const next = newEmail.trim().toLowerCase();
  const current = (getProviderEmail(user, 'password') || user.email || '').toLowerCase();
  if (next === current) throw appError('app/same-email');
  await reauthPassword(user, currentPassword);
  await verifyBeforeUpdateEmail(user, next);
};

// حذف طريقة البريد وكلمة السر: ممنوع إن لم يكن جوجل مضافاً
export const removeEmailMethod = async (): Promise<void> => {
  const user = currentUserOrThrow();
  await assertTrusted(user.uid);
  if (!hasProvider(user, 'password')) throw { code: 'auth/no-such-provider' };
  if (!hasProvider(user, 'google.com')) throw appError('app/last-method');
  await reauthGoogle();
  await unlink(user, 'password');
  await syncPrivateEmail().catch(() => undefined);
};

// ---- جوجل ----

// ربط حساب جوجل (لحساب مسجّل بالبريد فقط)
export const addGoogleAccount = async (password: string): Promise<void> => {
  const user = currentUserOrThrow();
  await assertTrusted(user.uid);
  if (hasProvider(user, 'google.com')) throw { code: 'auth/provider-already-linked' };
  if (!hasProvider(user, 'password')) throw appError('app/need-email-method');
  await reauthPassword(user, password);
  if (Capacitor.isNativePlatform()) {
    const { cred } = await pickNativeGoogle();
    await linkWithCredential(user, cred);
  } else {
    await linkWithPopup(user, googleProvider);
  }
  await syncPrivateEmail().catch(() => undefined);
};

// حذف جوجل: ممنوع إن لم يكن البريد وكلمة السر مضافين
export const removeGoogleAccount = async (password: string): Promise<void> => {
  const user = currentUserOrThrow();
  await assertTrusted(user.uid);
  if (!hasProvider(user, 'google.com')) throw { code: 'auth/no-such-provider' };
  if (!hasProvider(user, 'password')) throw appError('app/last-method');
  await reauthPassword(user, password);
  await unlink(user, 'google.com');
  await syncPrivateEmail().catch(() => undefined);
};

// تغيير حساب جوجل: تأكيد الحساب الحالي ثم اختيار الجديد، مع التراجع التلقائي إن فشل الربط
export const changeGoogleAccount = async (): Promise<void> => {
  const user = currentUserOrThrow();
  await assertTrusted(user.uid);
  if (!hasProvider(user, 'google.com')) throw { code: 'auth/no-such-provider' };
  if (!hasProvider(user, 'password')) throw appError('app/need-email-method');

  const oldEmail = (getProviderEmail(user, 'google.com') || '').toLowerCase();
  const oldCred = await reauthGoogleCred(user);

  let newCred: AuthCredential | null = null;
  if (Capacitor.isNativePlatform()) {
    const picked = await pickNativeGoogle();
    if (picked.email && oldEmail && picked.email === oldEmail) throw appError('app/same-google');
    newCred = picked.cred;
  }

  await unlink(user, 'google.com');
  try {
    if (newCred) await linkWithCredential(user, newCred);
    else await linkWithPopup(user, googleProvider);
  } catch (e) {
    // نعيد ربط الحساب القديم حتى لا يفقد المستخدم طريقة الدخول بجوجل
    if (oldCred) await linkWithCredential(user, oldCred).catch(() => undefined);
    throw e;
  }
  await syncPrivateEmail().catch(() => undefined);
};

export const changePassword = async (current: string, next: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('no-user');
  await assertTrusted(user.uid);
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
};

// نص الخطأ بلغة المستخدم الحالية (المفاتيح موجودة في ملف الترجمة securityExtra)
export const authErrorText = (e: any): string => {
  const code = String(e?.code ?? e?.message ?? '');
  if (/untrusted-device/.test(code)) return tr('sc.err.untrusted');
  if (/trust-check-failed/.test(code)) return tr('sc.err.trustCheck');
  if (/last-method/.test(code)) return tr('sc.err.lastMethod');
  if (/same-email/.test(code)) return tr('sc.err.sameEmail');
  if (/same-google/.test(code)) return tr('sc.err.sameGoogle');
  if (/need-email-method/.test(code)) return tr('sc.err.needEmail');
  if (/no-such-provider/.test(code)) return tr('sc.err.noProvider');
  if (/invalid-email/.test(code)) return tr('sc.err.invalidEmail');
  if (/wrong-password|invalid-credential|invalid-login/.test(code)) return tr('sc.err.wrongPassword');
  if (/weak-password/.test(code)) return tr('sc.err.weakPassword');
  if (/email-already-in-use/.test(code)) return tr('sc.err.emailInUse');
  if (/credential-already-in-use/.test(code)) return tr('sc.err.credentialInUse');
  if (/provider-already-linked/.test(code)) return tr('sc.err.alreadyLinked');
  if (/user-mismatch/.test(code)) return tr('sc.err.userMismatch');
  if (/too-many-requests/.test(code)) return tr('sc.err.tooMany');
  if (/network/.test(code)) return tr('sc.err.network');
  if (/cancel|12501|12502|popup-closed/i.test(code)) return tr('sc.err.cancelled');
  if (/requires-recent-login/.test(code)) return tr('sc.err.recentLogin');
  return tr('sc.err.generic');
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
