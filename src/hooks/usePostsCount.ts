import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { POSTS_CHANGED_EVENT, reconcilePostsCount } from '../services/postService';

export interface PostsCountState {
  postsCount: number;
  loading: boolean;
  error: boolean;
}

interface PostsChangedDetail {
  uid?: string;
  delta?: number;
}

const RECONCILE_DELAY_MS = 2500;

const toCount = (raw: unknown): number =>
  typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

/**
 * عدّاد المنشورات اللحظي: مستمع onSnapshot على وثيقة المستخدم.
 * أي زيادة أو نقصان في postsCount (نشر منشور أو حذفه) يظهر فوراً بدون إعادة تحميل.
 *
 * isOwner = true (ملفي أنا): نصحّح العدّاد المخزّن مرة واحدة عند الفتح، وبعد أي نشر/حذف
 * إن لم يتطابق مع العدد الفعلي (القواعد تسمح لصاحب الحساب فقط بتعديله).
 */
export const usePostsCount = (uid: string | undefined, isOwner: boolean): PostsCountState => {
  const [state, setState] = useState<PostsCountState>({ postsCount: 0, loading: !!uid, error: false });

  useEffect(() => {
    if (!uid) {
      setState({ postsCount: 0, loading: false, error: false });
      return;
    }
    setState({ postsCount: 0, loading: true, error: false });

    let reconciledOnce = false;
    let timer: number | undefined;

    const reconcile = () => {
      if (!isOwner) return;
      reconcilePostsCount(uid).catch((e) => console.error('postsCount reconcile failed:', e));
    };

    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.data() as { postsCount?: unknown } | undefined;
        setState({ postsCount: toCount(data?.postsCount), loading: false, error: false });
        if (isOwner && !reconciledOnce && !snap.metadata.hasPendingWrites) {
          reconciledOnce = true;
          reconcile();
        }
      },
      (e) => {
        console.error('postsCount listener error:', e);
        setState((prev) => ({ ...prev, loading: false, error: true }));
      }
    );

    const onChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<PostsChangedDetail>).detail;
      if (!isOwner || detail?.uid !== uid) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(reconcile, RECONCILE_DELAY_MS);
    };
    window.addEventListener(POSTS_CHANGED_EVENT, onChanged);

    return () => {
      unsubscribe();
      window.removeEventListener(POSTS_CHANGED_EVENT, onChanged);
      window.clearTimeout(timer);
    };
  }, [uid, isOwner]);

  return state;
};
