import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup, // نتركه للويب
  signInWithRedirect, // 🔥 نضيفه للهاتف
  getRedirectResult, // 🔥 لمعالجة العودة من المتصفح
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { createUserProfile, getUserProfile } from '../services/userService';
import type { UserProfile } from '../types';
import { Capacitor } from '@capacitor/core';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resendVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // معالجة العودة من تسجيل الدخول بغوغل (للهاتف)
  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      console.error('Redirect result error:', error);
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);

      if (fbUser) {
        try {
          let p = await withTimeout(getUserProfile(fbUser.uid), 5000);

          if (!p) {
            try {
              p = await withTimeout(
                createUserProfile(fbUser.uid, {
                  email: fbUser.email || undefined,
                  displayName: fbUser.displayName || 'مستخدم AnimeVerse',
                  photoURL: fbUser.photoURL || undefined,
                }),
                5000
              );
            } catch (e) {
              console.error('createUserProfile failed:', e);
            }
          }
          setProfile(p);
        } catch (e) {
          console.error('Auth init failed:', e);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const signInEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpEmail = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await sendEmailVerification(cred.user);
      await fbUpdateProfile(cred.user, { displayName });
      await createUserProfile(cred.user.uid, { email, displayName });
    } catch (e) {
      console.error('Signup extras failed:', e);
    }
  };

  // 🔥 إصلاح مشكلة غوغل للهاتف
  const signInGoogle = async () => {
    if (Capacitor.isNativePlatform()) {
      // في الهاتف: نستخدم Redirect
      await signInWithRedirect(auth, googleProvider);
    } else {
      // في المتصفح: نستخدم Popup
      const cred = await signInWithPopup(auth, googleProvider);
      try {
        const existing = await withTimeout(getUserProfile(cred.user.uid), 5000);
        if (!existing) {
          await createUserProfile(cred.user.uid, {
            email: cred.user.email || undefined,
            displayName: cred.user.displayName || 'مستخدم AnimeVerse',
            photoURL: cred.user.photoURL || undefined,
          });
        }
      } catch (e) {
        console.error('google profile failed:', e);
      }
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const p = await withTimeout(getUserProfile(user.uid), 5000);
      setProfile(p);
    } catch {
      /* ignore */
    }
  };

  const resendVerification = async () => {
    if (!auth.currentUser) throw new Error('no-user');
    await sendEmailVerification(auth.currentUser);
  };

  const isAdmin = profile?.role === 'admin';
  const isModerator = profile?.role === 'moderator' || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin,
        isModerator,
        signInEmail,
        signUpEmail,
        signInGoogle,
        signOut,
        refreshProfile,
        resendVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
