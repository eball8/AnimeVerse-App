import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  signOut as fbSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db } from '../config/firebase';
import { hasProvider, reauthGoogle } from './settingsService';

// true أثناء التعطيل أو الحذف: يمنع مستمع الدخول من إعادة التفعيل أو إنشاء ملف جديد
export const accountGuard = { busy: false };

const nativeSignOut = async (): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await FirebaseAuthentication.signOut().catch(() => undefined);
  }
};

// ---------------- التعطيل المؤقت ----------------
// يُخفي الملف الشخصي ويُسجّل الخروج. تسجيل الدخول لاحقاً يعيد التفعيل تلقائياً (انظر AuthContext).
export const deactivateAccount = async (uid: string): Promise<void> => {
  accountGuard.busy = true;
  try {
    await updateDoc(doc(db, 'users', uid), {
      isDeactivated: true,
      deactivatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await nativeSignOut();
    await fbSignOut(auth);
  } finally {
    accountGuard.busy = false;
  }
};

// ---------------- الحذف النهائي ----------------
const CHUNK = 400;

const deleteRefs = async (refs: DocumentReference[]): Promise<void> => {
  for (let i = 0; i < refs.length; i += CHUNK) {
    const part = refs.slice(i, i + CHUNK);
    try {
      const batch = writeBatch(db);
      part.forEach((r) => batch.delete(r));
      await batch.commit();
    } catch {
      // إن رُفض مستند واحد لا نوقف حذف الباقي
      await Promise.all(part.map((r) => deleteDoc(r).catch(() => undefined)));
    }
  }
};

const deleteWhere = async (col: string, field: string, uid: string): Promise<void> => {
  const snap = await getDocs(query(collection(db, col), where(field, '==', uid)));
  await deleteRefs(snap.docs.map((d) => d.ref));
};

// نحذف رسائلنا فقط ونترك المحادثة للطرف الآخر
const deleteMyMessages = async (uid: string): Promise<void> => {
  const convs = await getDocs(query(collection(db, 'conversations'), where('members', 'array-contains', uid)));
  for (const c of convs.docs) {
    const msgs = await getDocs(query(collection(c.ref, 'messages'), where('senderId', '==', uid)));
    await deleteRefs(msgs.docs.map((d) => d.ref));
  }
};

const reauth = async (user: User, password?: string): Promise<void> => {
  if (password !== undefined && hasProvider(user, 'password') && user.email) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else if (hasProvider(user, 'google.com')) {
    await reauthGoogle();
  } else {
    const e: any = new Error('PASSWORD_REQUIRED');
    e.code = 'auth/wrong-password';
    throw e;
  }
};

export const deleteAccount = async (
  user: User,
  password: string | undefined,
  onStep?: (label: string) => void
): Promise<void> => {
  const uid = user.uid;
  accountGuard.busy = true;
  try {
    // 1) إعادة التحقق من الهوية أولاً، فلا نحذف شيئاً إن فشلت
    onStep?.('التحقق من الهوية...');
    await reauth(user, password);

    // 2) حذف بيانات المستخدم (نتابع حتى لو فشلت خطوة منفردة)
    const steps: [string, () => Promise<void>][] = [
      ['حذف المنشورات...', () => deleteWhere('posts', 'authorId', uid)],
      ['حذف التعليقات...', () => deleteWhere('comments', 'authorId', uid)],
      ['حذف القصص...', async () => {
        await deleteWhere('stories', 'authorId', uid);
        await deleteWhere('storyViews', 'viewerId', uid);
        await deleteWhere('storyViews', 'authorId', uid);
      }],
      ['حذف الإعجابات...', async () => {
        await deleteWhere('likes', 'userId', uid);
        await deleteWhere('friendActivity', 'userId', uid);
      }],
      ['حذف المتابعات...', async () => {
        await deleteWhere('follows', 'followerId', uid);
        await deleteWhere('follows', 'followingId', uid);
        await deleteWhere('followRequests', 'followerId', uid);
        await deleteWhere('followRequests', 'followingId', uid);
      }],
      ['حذف الإشعارات والحظر...', async () => {
        await deleteWhere('notifications', 'toUid', uid);
        await deleteWhere('blocks', 'blockerId', uid);
      }],
      ['حذف المكتبة والتقييمات...', async () => {
        await deleteWhere('library', 'userId', uid);
        await deleteWhere('episodeRatings', 'userId', uid);
        await deleteWhere('chatPrefs', 'userId', uid);
      }],
      ['حذف رسائلك...', () => deleteMyMessages(uid)],
      ['حذف المفاتيح والأجهزة...', async () => {
        for (const col of ['notes', 'publicKeys', 'keyBackups', 'userPrivate']) {
          await deleteDoc(doc(db, col, uid)).catch(() => undefined);
        }
        const devs = await getDocs(collection(db, 'userDevices', uid, 'items'));
        await deleteRefs(devs.docs.map((d) => d.ref));
      }],
    ];

    for (const [label, run] of steps) {
      onStep?.(label);
      try {
        await run();
      } catch (e) {
        console.error('Account cleanup step failed:', label, e);
      }
    }

    // 3) ملف المستخدم يُحذف أخيراً (يحرّر اسم المستخدم) ثم حساب الدخول
    onStep?.('حذف الحساب...');
    await deleteDoc(doc(db, 'users', uid));
    await deleteUser(user);
    await nativeSignOut();
    try {
      localStorage.removeItem('av_profile_cache');
    } catch {
      // لا يؤثر على الحذف
    }
  } finally {
    accountGuard.busy = false;
  }
};
