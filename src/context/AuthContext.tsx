import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithCredential,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, googleProvider } from '../config/firebase';
import { createUserProfile, getUserProfile, checkUsernameAvailable, updateUserProfile } from '../services/userService';
import { accountGuard } from '../services/accountService';
import { calcAge } from '../utils/age';
import type { UserProfile, Gender } from '../types';
import { Capacitor } from '@capacitor/core';
import { saveAccount } from '../utils/savedAccounts';
import { checkDevice } from '../services/deviceService';

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
  gender: Gender;
  birthDate: string; // YYYY-MM-DD
}

// بيانات التسجيل المعلّقة: يستهلكها مستمع onIdTokenChanged عند إنشاء الملف
// لتجنّب سباق كتابتين على مستند users/{uid}
let pendingSignUpProfile: Partial<UserProfile> | null = null;
// بوابة تُبقي المستمع ينتظر حتى ينتهي فحص اسم المستخدم (true = متاح)
let signUpGate: Promise<boolean> | null = null;
let openSignUpGate: (ok: boolean) => void = () => undefined;

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (data: SignUpData) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// نحفظ آخر بروفايل على الجهاز ليفتح التطبيق فوراً بدون انتظار Firestore
const PROFILE_CACHE_KEY = 'av_profile_cache';

const readCachedProfile = (uid: string): UserProfile | null => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    return parsed && parsed.uid === uid ? parsed : null;
  } catch {
    return null;
  }
};

const writeCachedProfile = (p: UserProfile | null) => {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      setUser(fbUser);

      if (!fbUser) {
        setProfile(null);
        writeCachedProfile(null);
        setLoading(false);
        return;
      }

      // 1) اعرض البروفايل المحفوظ فوراً
      const cached = readCachedProfile(fbUser.uid);
      if (cached) {
        setProfile(cached);
        setLoading(false);
      }

      // 2) حدّثه من Firestore بالخلفية
      try {
        let p = await getUserProfile(fbUser.uid);
        if (!p) {
          // أثناء حذف الحساب لا نُنشئ ملفاً جديداً
          if (accountGuard.busy) return;
          if (signUpGate) {
            const ok = await signUpGate;
            signUpGate = null;
            if (!ok) return; // تم التراجع عن الحساب
          }
          const pending = pendingSignUpProfile;
          pendingSignUpProfile = null;
          p = await createUserProfile(fbUser.uid, {
            email: fbUser.email || undefined,
            displayName: fbUser.displayName || 'مستخدم AnimeVerse',
            photoURL: fbUser.photoURL || undefined,
            ...(pending || {}),
          });
        }
        // تسجيل الدخول يعيد تفعيل الحساب المعطّل تلقائياً
        if (p.isDeactivated && !accountGuard.busy) {
          try {
            await updateUserProfile(fbUser.uid, { isDeactivated: false });
            p = { ...p, isDeactivated: false };
          } catch (e) {
            console.error('Reactivation failed:', e);
          }
        }
        setProfile(p);
        writeCachedProfile(p);
        checkDevice(fbUser.uid).catch(() => undefined);
        saveAccount({
          uid: fbUser.uid,
          email: fbUser.email || '',
          displayName: p.displayName || fbUser.displayName || (fbUser.email || '').split('@')[0],
          photoURL: p.photoURL || fbUser.photoURL || undefined,
          provider: fbUser.providerData[0]?.providerId === 'google.com' ? 'google' : 'password',
        });
      } catch (e) {
        console.error('Profile fetch failed:', e);
        if (!cached) setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpEmail = async (d: SignUpData) => {
    const username = d.username.trim().toLowerCase();
    const firstName = d.firstName.trim();
    const lastName = d.lastName.trim();
    const displayName = `${firstName} ${lastName}`.trim();

    // تجهيز بيانات الملف قبل إنشاء الحساب حتى يكتبها المستمع مرة واحدة
    pendingSignUpProfile = {
      firstName,
      lastName,
      displayName,
      username,
      gender: d.gender,
      birthDate: d.birthDate,
      age: calcAge(d.birthDate),
    };

    signUpGate = new Promise<boolean>((resolve) => { openSignUpGate = resolve; });

    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, d.email, d.password);
    } catch (e) {
      pendingSignUpProfile = null;
      openSignUpGate(false);
      signUpGate = null;
      throw e;
    }

    // قواعد Firestore تشترط تسجيل الدخول للقراءة، لذلك نتحقق من اسم المستخدم هنا
    // وإن كان محجوزاً نتراجع عن إنشاء الحساب بالكامل
    try {
      const free = await checkUsernameAvailable(username, cred.user.uid);
      if (!free) {
        pendingSignUpProfile = null;
        openSignUpGate(false);
        await cred.user.delete().catch(console.error);
        await fbSignOut(auth).catch(() => undefined);
        const err: any = new Error('USERNAME_TAKEN');
        err.code = 'app/username-taken';
        throw err;
      }
    } catch (e: any) {
      if (e?.code === 'app/username-taken') throw e;
      console.error('Username check failed:', e);
    }
    openSignUpGate(true);

    sendEmailVerification(cred.user).catch(console.error);
    fbUpdateProfile(cred.user, { displayName }).catch(console.error);
  };

  const signInGoogle = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle({
          skipNativeAuth: true,
          useCredentialManager: false,
        } as any);
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error('NO_ID_TOKEN');
        const cred = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, cred);
      } else {
        const { signInWithPopup } = await import('firebase/auth');
        const cred = await signInWithPopup(auth, googleProvider);
        const existing = await getUserProfile(cred.user.uid);
        if (!existing) {
          await createUserProfile(cred.user.uid, {
            email: cred.user.email || undefined,
            displayName: cred.user.displayName || 'مستخدم AnimeVerse',
            photoURL: cred.user.photoURL || undefined,
          });
        }
      }
    } catch (error: any) {
      // المستخدم تراجع بنفسه (12501 أو إغلاق النافذة): ليس خطأً
      const code = String(error?.code ?? '');
      const msg = String(error?.message ?? '');
      const cancelled =
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        /12501|12502|cancel/i.test(code + ' ' + msg);
      if (cancelled) {
        const e: any = new Error('GOOGLE_SIGNIN_CANCELLED');
        e.cancelled = true;
        throw e;
      }
      console.error('Google sign-in failed:', error);
      throw error;
    }
  };

  const signOut = async () => {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut();
    }
    await fbSignOut(auth);
    setProfile(null);
    writeCachedProfile(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await getUserProfile(user.uid);
    setProfile(p);
    writeCachedProfile(p);
  };

  const resendVerification = async () => {
    if (!auth.currentUser) throw new Error('no-user');
    await sendEmailVerification(auth.currentUser);
  };

  const refreshUser = () => {
    setUser(auth.currentUser ? { ...auth.currentUser } : null);
  };

  const isAdmin = profile?.role === 'admin';
  const isModerator = profile?.role === 'moderator' || isAdmin;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isModerator, signInEmail, signUpEmail, signInGoogle, signOut, refreshProfile, resendVerification, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthContext');
  return ctx;
};
