import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { subscribeStories, filterVisibleStories, StoryGroup } from '../services/storyService';
import { subscribeFollowRelations } from '../services/chatPrefsService';
import type { FollowRelations } from '../services/chatPrefsService';

interface UseVisibleStoriesOptions {
  showActivity?: boolean;
}

export const useVisibleStories = (options: UseVisibleStoriesOptions = {}) => {
  const { user } = useAuth();
  const me = user?.uid;
  const [allGroups, setAllGroups] = useState<StoryGroup[]>([]);
  const [rel, setRel] = useState<FollowRelations | null>(null);
  const [authorAccountTypes, setAuthorAccountTypes] = useState<Record<string, 'public' | 'private'>>({});
  const [meFollowsAuthors, setMeFollowsAuthors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // 1) الاشتراك في القصص الخام
  useEffect(() => {
    const unsub = subscribeStories(setAllGroups);
    return () => unsub();
  }, []);

  // 2) الاشتراك في علاقات المتابعة
  useEffect(() => {
    if (!me) return;
    const unsub = subscribeFollowRelations(me, setRel);
    return () => unsub();
  }, [me]);

  // 3) جلب أنواع حسابات أصحاب القصص والتحقق من المتابعة
  useEffect(() => {
    if (!me || allGroups.length === 0 || !rel) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      const authorIds = Array.from(new Set(allGroups.map((g) => g.authorId)));
      const types: Record<string, 'public' | 'private'> = {};

      // جلب أنواع الحسابات (public/private)
      // يمكن استعلام 10 مستخدمين في كل مرة
      for (let i = 0; i < authorIds.length; i += 10) {
        const chunk = authorIds.slice(i, i + 10);
        try {
          const snap = await getDocs(
            query(collection(db, 'users'), where(documentId(), 'in', chunk))
          );
          snap.forEach((d) => {
            const data = d.data() as any;
            types[d.id] = data.accountType === 'private' ? 'private' : 'public';
          });
        } catch (e) {
          console.error('failed to fetch account types:', e);
        }
      }

      if (cancelled) return;

      setAuthorAccountTypes(types);

      // التحقق من متابعة أنا لكل مؤلف
      const follows = new Set<string>();
      for (const authorId of authorIds) {
        if (authorId === me) continue;
        try {
          const snap = await getDoc(doc(db, 'follows', `${me}_${authorId}`));
          if (snap.exists()) follows.add(authorId);
        } catch {}
      }

      if (cancelled) return;

      setMeFollowsAuthors(follows);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [me, allGroups, rel]);

  // 4) تصفية القصص بناءً على المنطق
  const visibleGroups = useMemo(() => {
    if (!me || !rel) return [];
    return filterVisibleStories(allGroups, me, rel, authorAccountTypes, meFollowsAuthors);
  }, [allGroups, me, rel, authorAccountTypes, meFollowsAuthors]);

  return {
    groups: visibleGroups,
    loading,
    allGroups,
  };
};
