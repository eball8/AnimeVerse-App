import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
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
        // 🔥 تم إزالة clientId لأن المكتبة تقرأه من ملف google-services.json تلقائياً
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result.user) {
           console.log('Google Native Sign-in success:', result.user);
        }
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
    } catch (error) {
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
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
