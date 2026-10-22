import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../config/firebase';
import { createUserProfile, getUserProfile, checkUsernameAvailable, updateUserProfile } from '../services/userService';
import { accountGuard } from '../services/accountService';
import { calcAge } from '../utils/age';
import { tr } from '../i18n/staticT';
import type { UserProfile, Gender } from '../types';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { saveAccount } from '../utils/savedAccounts';
import { checkDevice } from '../services/deviceService';

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
  gender: Gender;
  birthDate: string;
}

let pendingSignUpProfile: Partial<UserProfile> | null = null;
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
  signInGoogle: (hintEmail?: string) => Promise<string | undefined>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GoogleHint = registerPlugin<{ signIn(opts: { email: string }): Promise<{ idToken: string }> }>('GoogleHint');
const OWNER_USERNAME = 'animeverse_official';

const verifyOwner = async (fbUser: User, username: string | undefined): Promise<boolean> => {
  if (!username || username.toLowerCase() !== OWNER_USERNAME) return false;
  if (!fbUser.emailVerified) return false;
  try {
    const snap = await getDoc(doc(db, 'usernames', OWNER_USERNAME));
    return snap.exists() && snap.data().uid === fbUser.uid;
  } catch {
    return false;
  }
};

const PROFILE_CACHE_KEY = 'av_profile_cache';
const PENDING_SIGNUP_KEY = 'av_pending_signup';

// حساب بريد/كلمة سر لم يؤكَّد بريده بعد: لا نُنشئ له ملفاً في قاعدة البيانات حتى يؤكّد
export const isUnverifiedPasswordUser = (u: User | null | undefined): boolean =>
  !!u && !u.emailVerified && u.providerData[0]?.providerId === 'password';

// بيانات التسجيل تُحفظ محلياً مؤقتاً (تبقى حتى لو أُغلق التطبيق قبل التأكيد)
const savePendingSignup = (uid: string, data: Partial<UserProfile>) => {
  try { localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ uid, data })); } catch {}
};
const readPendingSignup = (uid: string): Partial<UserProfile> | null => {
  try {
    const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid: string; data: Partial<UserProfile> };
    return parsed && parsed.uid === uid ? parsed.data : null;
  } catch {
    return null;
  }
};
const clearPendingSignup = () => {
  try { localStorage.removeItem(PENDING_SIGNUP_KEY); } catch {}
};

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

// هل الخطأ ناتج عن إلغاء المستخدم للعملية؟
const isCancelError = (error: any): boolean => {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '');
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    /12501|12502|cancel/i.test(code + ' ' + msg)
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwnerAccount, setIsOwnerAccount] = useState(false);

  const inflight = useRef<Map<string, Promise<void>>>(new Map());

  const syncProfile = async (fbUser: User, cached: UserProfile | null) => {
    try {
      let p = await getUserProfile(fbUser.uid);
      if (!p) {
        if (accountGuard.busy) return;
        // ✅ حساب لم يؤكَّد بريده: لا نكتب أي شيء في قاعدة البيانات الآن
        if (isUnverifiedPasswordUser(fbUser)) {
          setProfile(null);
          setLoading(false);
          return;
        }
        if (signUpGate) {
          const ok = await signUpGate;
          signUpGate = null;
          if (!ok) return;
        }
        const pending = pendingSignUpProfile || readPendingSignup(fbUser.uid);
        pendingSignUpProfile = null;
        const base = {
          email: fbUser.email || undefined,
          displayName: fbUser.displayName || tr('misc.defaultUser'),
          photoURL: fbUser.photoURL || undefined,
        };
        try {
          p = await createUserProfile(fbUser.uid, { ...base, ...(pending || {}) });
        } catch (e: any) {
          // اسم المستخدم أُخذ من شخص آخر أثناء انتظار التأكيد → نُنشئ الحساب باسم تلقائي
          if (pending?.username && (e?.code === 'app/username-taken' || /taken/i.test(String(e?.message)))) {
            const { username: _u, ...rest } = pending;
            p = await createUserProfile(fbUser.uid, { ...base, ...rest });
          } else {
            throw e;
          }
        }
        clearPendingSignup();
      }
      if (p.isDeactivated && !accountGuard.busy) {
        try {
          await updateUserProfile(fbUser.uid, { isDeactivated: false });
          p = { ...p, isDeactivated: false };
        } catch (e) {
          console.error('Reactivation failed:', e);
        }
      }

      if (p.isEmailVerified !== fbUser.emailVerified) {
        try {
          await updateUserProfile(fbUser.uid, { isEmailVerified: fbUser.emailVerified });
          p = { ...p, isEmailVerified: fbUser.emailVerified };
        } catch (e) {
          console.error('Email verification sync failed:', e);
        }
      }

      setIsOwnerAccount(await verifyOwner(fbUser, p.username));
      setProfile(p);
      writeCachedProfile(p);
      checkDevice(fbUser.uid).catch(() => undefined);
      // البريد ضروري ليُسجَّل الدخول مباشرة بدون قائمة حسابات غوغل، لذلك نبحث عنه في كل مصدر متاح
      const accEmail =
        fbUser.email ||
        fbUser.providerData.find((x) => !!x?.email)?.email ||
        (p as { email?: string }).email ||
        '';
      saveAccount({
        uid: fbUser.uid,
        email: accEmail,
        displayName: p.displayName || fbUser.displayName || accEmail.split('@')[0],
        photoURL: p.photoURL || fbUser.photoURL || undefined,
        provider: fbUser.providerData[0]?.providerId === 'google.com' ? 'google' : 'password',
      });
    } catch (e) {
      console.error('Profile fetch failed:', e);
      if (!cached) setProfile(null);
    }
    setLoading(false);
  };

  // يمنع التنفيذ المزدوج (المستمع + refreshUser) لنفس المستخدم وبنفس حالة التأكيد
  const runSync = (fbUser: User, cached: UserProfile | null): Promise<void> => {
    const key = `${fbUser.uid}:${fbUser.emailVerified}`;
    const existing = inflight.current.get(key);
    if (existing) return existing;
    const pr = syncProfile(fbUser, cached).finally(() => inflight.current.delete(key));
    inflight.current.set(key, pr);
    return pr;
  };

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      setUser(fbUser);

      if (!fbUser) {
        setProfile(null);
        setIsOwnerAccount(false);
        writeCachedProfile(null);
        setLoading(false);
        return;
      }

      const cached = readCachedProfile(fbUser.uid);
      if (cached) {
        setIsOwnerAccount(cached.username === OWNER_USERNAME && fbUser.emailVerified);
        setProfile(cached);
        setLoading(false);
      }

      await runSync(fbUser, cached);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpEmail = async (d: SignUpData) => {
    const username = d.username.trim().toLowerCase();
    const firstName = d.firstName.trim();
    const lastName = d.lastName.trim();
    const displayName = `${firstName} ${lastName}`.trim();

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

    try {
      const free = await checkUsernameAvailable(username, cred.user.uid);
      if (!free) {
        pendingSignUpProfile = null;
        openSignUpGate(false);
        signUpGate = null;
        await cred.user.delete().catch(() => undefined);
        const err: any = new Error('USERNAME_TAKEN');
        err.code = 'app/username-taken';
        throw err;
      }
    } catch (e: any) {
      if (e?.code === 'app/username-taken') throw e;
      console.error('Username check failed:', e);
    }
    // نحفظ بيانات التسجيل محلياً فقط؛ الملف الشخصي يُنشأ في قاعدة البيانات بعد تأكيد البريد
    if (pendingSignUpProfile) savePendingSignup(cred.user.uid, pendingSignUpProfile);
    openSignUpGate(true);

    sendEmailVerification(cred.user).catch(console.error);
    fbUpdateProfile(cred.user, { displayName }).catch(console.error);
  };

  // يستخرج البريد من رمز غوغل نفسه (مضمون لأن requestEmail مفعّل) ليُحفظ حتى لو كان user.email فارغاً
  const emailFromIdToken = (token?: string): string | undefined => {
    try {
      if (!token) return undefined;
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(part).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
      );
      return (JSON.parse(json).email as string | undefined) || undefined;
    } catch {
      return undefined;
    }
  };

  const signInGoogle = async (hintEmail?: string): Promise<string | undefined> => {
    let tokenEmail: string | undefined;
    // نص تشخيصي يُعرض في شاشة الدخول لمعرفة سبب الفشل بدقة
    let hintDetail = '';
    try {
      if (Capacitor.isNativePlatform()) {
        let idToken: string | undefined;

        // الأولوية دائماً لإضافة GoogleHint (تعمل مع البريد ومن دونه)
        if (Capacitor.isPluginAvailable('GoogleHint')) {
          try {
            const r = await GoogleHint.signIn({ email: hintEmail || '' });
            idToken = r.idToken;
          } catch (hintErr: any) {
            // إلغاء المستخدم: نوقف العملية ولا ننتقل للطريقة الاحتياطية
            if (isCancelError(hintErr)) throw hintErr;
            hintDetail = `GoogleHint: ${String(hintErr?.code ?? '')} ${String(hintErr?.message ?? '')}`.trim();
            console.error('GoogleHint failed, falling back:', hintErr);
          }
        } else {
          hintDetail = 'GoogleHint plugin not available';
        }

        // احتياطي: الإضافة الثانية، فقط إذا لم تنجح GoogleHint
        if (!idToken) {
          try {
            const result = await FirebaseAuthentication.signInWithGoogle({
              skipNativeAuth: true,
              useCredentialManager: false,
            } as any);
            idToken = result.credential?.idToken;
          } catch (fbErr: any) {
            if (isCancelError(fbErr)) throw fbErr;
            try { fbErr.hintDetail = hintDetail; } catch {}
            throw fbErr;
          }
        }

        if (!idToken) {
          const err: any = new Error('NO_ID_TOKEN');
          err.hintDetail = hintDetail;
          throw err;
        }
        tokenEmail = emailFromIdToken(idToken);
        const cred = GoogleAuthProvider.credential(idToken);
        try {
          await signInWithCredential(auth, cred);
        } catch (credErr: any) {
          try { credErr.hintDetail = `signInWithCredential (token email: ${tokenEmail || 'none'})`; } catch {}
          throw credErr;
        }
      } else {
        const { signInWithPopup } = await import('firebase/auth');
        let provider = googleProvider;
        if (hintEmail) {
          provider = new GoogleAuthProvider();
          provider.setCustomParameters({ login_hint: hintEmail });
        }
        const cred = await signInWithPopup(auth, provider);
        const existing = await getUserProfile(cred.user.uid);
        if (!existing) {
          await createUserProfile(cred.user.uid, {
            email: cred.user.email || undefined,
            displayName: cred.user.displayName || tr('misc.defaultUser'),
            photoURL: cred.user.photoURL || undefined,
          });
        }
        tokenEmail = cred.user.email || undefined;
      }
      return tokenEmail || hintEmail;
    } catch (error: any) {
      if (isCancelError(error)) {
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
    setIsOwnerAccount(false);
    writeCachedProfile(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await getUserProfile(user.uid);
    setIsOwnerAccount(p ? await verifyOwner(user, p.username) : false);
    setProfile(p);
    writeCachedProfile(p);
  };

  const resendVerification = async () => {
    if (!auth.currentUser) throw new Error('no-user');
    await sendEmailVerification(auth.currentUser);
  };

  // يُستدعى بعد reload(): يجدّد التوكن (ليحمل email_verified) ثم ينشئ الملف الشخصي إن لزم
  const refreshUser = async () => {
    const cu = auth.currentUser;
    if (!cu) {
      setUser(null);
      return;
    }
    if (cu.emailVerified) {
      await cu.getIdToken(true).catch(() => undefined);
    }
    setUser({ ...cu } as User);
    await runSync(cu, null);
  };

  const isAdmin = isOwnerAccount || profile?.role === 'admin';
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
