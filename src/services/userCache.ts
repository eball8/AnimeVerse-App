import { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export interface UserBrief {
  uid: string;
  displayName: string;
  photoURL?: string;
  username?: string;
}

const TTL_MS = 30000;
const cache = new Map<string, { t: number; v: UserBrief | null }>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
const notifyAll = () => listeners.forEach((fn) => fn());

const fetchBriefs = async (uids: string[]): Promise<void> => {
  const now = Date.now();
  const need = uids.filter((id) => {
    if (inflight.has(id)) return false;
    const e = cache.get(id);
    return !e || now - e.t > TTL_MS;
  });
  if (!need.length) return;
  need.forEach((id) => inflight.add(id));
  try {
    for (let i = 0; i < need.length; i += 10) {
      const chunk = need.slice(i, i + 10);
      try {
        const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
        const found = new Set<string>();
        snap.forEach((d) => {
          const x = d.data() as any;
          found.add(d.id);
          cache.set(d.id, {
            t: Date.now(),
            v: {
              uid: d.id,
              displayName: x.displayName || '',
              photoURL: x.photoURL || undefined,
              username: x.username,
            },
          });
        });
        chunk.forEach((id) => {
          if (!found.has(id)) cache.set(id, { t: Date.now(), v: null });
        });
      } catch (e) {
        console.error('user briefs failed:', e);
        chunk.forEach((id) => cache.set(id, { t: Date.now(), v: cache.get(id)?.v ?? null }));
      }
    }
  } finally {
    need.forEach((id) => inflight.delete(id));
    notifyAll();
  }
};

// يُستدعى بعد تعديل الملف الشخصي ليتحدّث الاسم والصورة فوراً
export const invalidateUser = (uid: string): void => {
  cache.delete(uid);
  fetchBriefs([uid]).catch(console.error);
};

export const useUserBriefs = (uids: Array<string | undefined>): Record<string, UserBrief> => {
  const { profile } = useAuth();
  const [, force] = useState(0);
  const key = Array.from(new Set(uids.filter((x): x is string => !!x))).sort().join(',');

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    if (key) fetchBriefs(key.split(','));
    return () => {
      listeners.delete(fn);
    };
  }, [key]);

  const out: Record<string, UserBrief> = {};
  if (key) {
    key.split(',').forEach((id) => {
      const e = cache.get(id);
      if (e && e.v) out[id] = e.v;
    });
  }
  // بياناتي أنا تأتي مباشرة من الحساب الحالي (تتحدث لحظياً)
  if (profile && key.split(',').includes(profile.uid)) {
    out[profile.uid] = {
      uid: profile.uid,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      username: profile.username,
    };
  }
  return out;
};

export const pickAuthor = (
  briefs: Record<string, UserBrief>,
  uid: string,
  fallbackName: string,
  fallbackPhoto?: string
): { name: string; photo?: string } => {
  const b = briefs[uid];
  if (b) return { name: b.displayName || fallbackName, photo: b.photoURL };
  return { name: fallbackName, photo: fallbackPhoto };
};
