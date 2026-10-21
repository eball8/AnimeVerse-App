import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile } from '../types';
import type { Post } from './postService';

const MAX_USERS = 15;
const MAX_POSTS = 5;
const SCAN_LATEST = 40;

export const searchUsers = async (term: string): Promise<UserProfile[]> => {
  const raw = term.trim().replace(/^@/, '');
  if (raw.length < 2) return [];

  const lower = raw.toLowerCase();
  const end = '\uf8ff';
  const col = collection(db, 'users');

  try {
    const [byUsername, byName] = await Promise.all([
      getDocs(query(col, where('username', '>=', lower), where('username', '<=', lower + end), limit(MAX_USERS))),
      getDocs(query(col, where('displayName', '>=', raw), where('displayName', '<=', raw + end), limit(MAX_USERS))),
    ]);

    const map = new Map<string, UserProfile>();
    [...byUsername.docs, ...byName.docs].forEach((d) => {
      if (!map.has(d.id)) {
        const data = d.data() as any;
        map.set(d.id, {
          uid: d.id,
          ...data,
        } as UserProfile);
      }
    });

    return Array.from(map.values())
      .filter((u) => {
        if (!u.username || !u.displayName) return false;
        if (u.isBanned || u.isDeactivated) return false;
        
        if (u.isEmailVerified === false) return false;
        
        return true;
      })
      .slice(0, MAX_USERS);
  } catch (error) {
    console.error('Search users error:', error);
    return [];
  }
};

export const searchPosts = async (term: string): Promise<{ posts: Post[]; videos: Post[] }> => {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return { posts: [], videos: [] };

  try {
    const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(SCAN_LATEST)));
    const matches = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Post))
      .filter((p) => (p.content || '').toLowerCase().includes(q));

    return {
      posts: matches.filter((p) => p.mediaType !== 'video').slice(0, MAX_POSTS),
      videos: matches.filter((p) => p.mediaType === 'video').slice(0, MAX_POSTS),
    };
  } catch (error) {
    console.error('Post search error:', error);
    return { posts: [], videos: [] };
  }
};
