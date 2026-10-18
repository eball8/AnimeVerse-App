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
import { createUserProfile, getUserProfile } from '../services/userService';
import type { UserProfile } from '../types';
import { Capacitor } from '@capacitor/core';
import { saveAccount } from '../utils/savedAccounts';

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
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        try {
          let p = await getUserProfile(fbUser.uid);
          if (!p) {
            p = await createUserProfile(fbUser.uid, {
              email: fbUser.email || undefined,
              displayName: fbUser.displayName || 'مستخدم AnimeVerse',
              photoURL: fbUser.photoURL || undefined,
            });
          }
          setProfile(p);
          saveAccount({
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: p.displayName || fbUser.displayName || (fbUser.email || '').split('@')[0],
            photoURL: p.photoURL || fbUser.photoURL || undefined,
            provider: fbUser.providerData[0]?.providerId === 'google.com' ? 'google' : 'password',
          });
        } catch (e) {
          console.error('Profile fetch failed:', e);
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
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await getUserProfile(user.uid);
    setProfile(p);
  };

  con
