import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup, 
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { createUserProfile, getUserProfile } from '../services/userService';
import type { UserProfile } from '../types';

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
  refreshUser: () => void; // 🔥 دالة جديدة لإجبار التطبيق على التحديث
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        let p = await getUserProfile(fbUser.uid);
        if (!p) {
          p = await createUserProfile(fbUser.uid, {
            email: fbUser.email || undefined,
            displayName: fbUser.displayName || 'مستخدم AnimeVerse',
            photoURL: fbUser.photoURL || undefined,
          });
        }
        setProfile(p);
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
    await sendEmailVerification(cred.user);
    await fbUpdateProfile(cred.user, { displayName });
    await createUserProfile(cred.user.uid, { email, displayName });
  };

  const signInGoogle = async () => {
    // استخدام Popup لأنه أفضل طريقة في المتصفحات المخفية
    const cred = await signInWithPopup(auth, googleProvider);
    const existing = await getUserProfile(cred.user.uid);
    if (!existing) {
      await createUserProfile(cred.user.uid, {
        email: cred.user.email || undefined,
        displayName: cred.user.displayName || 'مستخدم AnimeVerse',
        photoURL: cred.user.photoURL || undefined,
      });
    }
  };

  const signOut = async () => {
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

  // 🔥 دالة تُجبر React على تحديث حالة المستخدم
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
