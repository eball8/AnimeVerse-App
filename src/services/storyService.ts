import { db } from '../config/firebase';
import {
  collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where,
  doc, deleteDoc, Timestamp,
} from 'firebase/firestore';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const SEEN_KEY = 'animeverse_stories_seen';

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  createdAt: any;
}

export interface StoryGroup {
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  stories: Story[];
}

export type NewStory = Omit<Story, 'id' | 'createdAt'>;

export const createStory = async (data: NewStory) => {
  const caption = data.caption?.trim();
  // قواعد Firestore تقبل هذه الحقول فقط، ولا تقبل undefined
  const payload: Record<string, any> = {
    authorId: data.authorId,
    authorName: data.authorName,
    mediaUrl: data.mediaUrl,
    mediaType: data.mediaType,
    createdAt: serverTimestamp(),
  };
  if (data.authorPhotoURL) payload.authorPhotoURL = data.authorPhotoURL;
  if (caption) payload.caption = caption.slice(0, 200);
  const ref = await addDoc(collection(db, 'stories'), payload);
  return ref.id;
};

export const deleteStory = async (storyId: string) => {
  await deleteDoc(doc(db, 'stories', storyId));
};

// يعيد وقت إنشاء القصة بالميلي ثانية (createdAt يكون null لحظة الإرسال المحلي)
export const storyMillis = (story: Pick<Story, 'createdAt'>): number => {
  const c = story.createdAt;
  if (!c) return Date.now();
  if (typeof c.toMillis === 'function') return c.toMillis();
  if (typeof c.seconds === 'number') return c.seconds * 1000;
  if (typeof c === 'number') return c;
  return Date.now();
};

// القصص الأقدم من 24 ساعة تختفي من الواجهة
export const subscribeStories = (callback: (groups: StoryGroup[]) => void) => {
  const since = Timestamp.fromMillis(Date.now() - STORY_TTL_MS);
  const q = query(
    collection(db, 'stories'),
    where('createdAt', '>', since),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<string, StoryGroup>();
      snap.forEach((d) => {
        const s = { id: d.id, ...d.data() } as Story;
        let g = map.get(s.authorId);
        if (!g) {
          g = {
            authorId: s.authorId,
            authorName: s.authorName,
            authorPhotoURL: s.authorPhotoURL,
            stories: [],
          };
          map.set(s.authorId, g);
        }
        g.authorName = s.authorName;
        g.authorPhotoURL = s.authorPhotoURL;
        g.stories.push(s);
      });
      const groups = Array.from(map.values()).sort(
        (a, b) =>
          storyMillis(b.stories[b.stories.length - 1]) -
          storyMillis(a.stories[a.stories.length - 1])
      );
      callback(groups);
    },
    (err) => {
      console.error('Error fetching stories:', err);
      callback([]);
    }
  );
};

const readSeen = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
};

export const markStorySeen = (authorId: string, millis: number) => {
  try {
    const seen = readSeen();
    if ((seen[authorId] || 0) >= millis) return;
    seen[authorId] = millis;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* ignore */
  }
};

export const hasSeenAll = (group: StoryGroup): boolean => {
  const last = group.stories[group.stories.length - 1];
  if (!last) return true;
  return (readSeen()[group.authorId] || 0) >= storyMillis(last);
};
