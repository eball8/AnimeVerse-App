import { auth, db } from '../config/firebase';
import {
  collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where,
  doc, deleteDoc, Timestamp, getDoc, getDocs, setDoc, updateDoc, writeBatch,
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
  // تنظيف سجلات المشاهدة (يستطيع صاحب القصة حذفها فقط، وفشل الحذف لا يمنع حذف القصة)
  try {
    const me = auth.currentUser?.uid;
    if (!me) return;
    const snap = await getDocs(
      query(collection(db, 'storyViews'), where('storyId', '==', storyId), where('authorId', '==', me))
    );
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) {
    console.error('story views cleanup failed:', e);
  }
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

// ---------- مشاهدات القصص والتفاعل ----------
// وثيقة واحدة لكل مشاهد: storyViews/{storyId}_{viewerId}
export interface StoryView {
  id: string;
  storyId: string;
  authorId: string;
  viewerId: string;
  liked: boolean;
  reply?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface StoryViewRecord {
  liked: boolean;
  reply?: string;
}

const viewRef = (storyId: string, viewerId: string) => doc(db, 'storyViews', `${storyId}_${viewerId}`);

// يسجّل مشاهدة المستخدم للقصة مرة واحدة فقط، ويعيد حالته الحالية (إعجاب/رد سابق)
export const recordStoryView = async (story: Story, viewerId: string): Promise<StoryViewRecord> => {
  if (story.authorId === viewerId) return { liked: false };
  const ref = viewRef(story.id, viewerId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data() as any;
    return { liked: !!d.liked, reply: typeof d.reply === 'string' ? d.reply : undefined };
  }
  await setDoc(ref, {
    storyId: story.id,
    authorId: story.authorId,
    viewerId,
    liked: false,
    createdAt: serverTimestamp(),
  });
  return { liked: false };
};

export const setStoryLiked = async (story: Story, viewerId: string, liked: boolean): Promise<void> => {
  await updateDoc(viewRef(story.id, viewerId), { liked, updatedAt: serverTimestamp() });
};

// يحفظ آخر رد للمشاهد (يستبدل الرد السابق). الرد ظاهر لصاحب القصة والمشاهد فقط.
export const sendStoryReply = async (story: Story, viewerId: string, text: string): Promise<void> => {
  const reply = text.trim().slice(0, 200);
  if (!reply) return;
  await updateDoc(viewRef(story.id, viewerId), { reply, updatedAt: serverTimestamp() });
};

// قائمة المشاهدين لصاحب القصة (الشرط الثاني ضروري لتقبله قواعد Firestore)
export const subscribeStoryViews = (
  story: Pick<Story, 'id' | 'authorId'>,
  callback: (views: StoryView[]) => void,
  onError?: (e: unknown) => void
) => {
  const q = query(
    collection(db, 'storyViews'),
    where('storyId', '==', story.id),
    where('authorId', '==', story.authorId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StoryView));
      const ms = (v: StoryView) => v.createdAt?.toMillis?.() ?? Date.now();
      items.sort((a, b) => ms(b) - ms(a));
      callback(items);
    },
    onError
  );
};
