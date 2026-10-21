import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { deletePost, getMyLikedPostIds, getPostById, toggleLike } from '../services/postService';
import type { Post } from '../services/postService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { logAdmin } from '../services/adminLog';
import PostCard from './PostCard';
import CommentsSheet from './CommentsSheet';
import { useConfirm } from './ConfirmDialog';

interface Props {
  posts: Post[];
  startId?: string;
  title: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onPatch: (id: string, patch: Partial<Post>) => void;
}

/**
 * عارض منشورات الملف الشخصي (مثل انستغرام):
 * بالضغط على أي مربع في الشبكة تُفتح قائمة المنشورات بالحجم الكبير
 * وتنزلق مباشرة إلى المنشور الذي ضغطت عليه.
 */
const ProfilePostsViewer: React.FC<Props> = ({ posts, startId, title, onClose, onDeleted, onPatch }) => {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [items, setItems] = useState<Post[]>(posts);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  const briefs = useUserBriefs([
    ...items.map((p) => p.authorId),
    ...items.map((p) => p.repostOfAuthorId),
  ]);

  useEffect(() => {
    if (!user) return;
    getMyLikedPostIds(user.uid).then(setLiked).catch((e) => console.error(e));
  }, [user?.uid]);

  // نمنع تمرير الصفحة الخلفية
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // الانتقال إلى المنشور المضغوط (ونعيد الضبط قليلاً بعد تحميل الصور لأن الارتفاعات تتغير)
  useLayoutEffect(() => {
    if (!startId) return;
    const align = () => {
      const box = scroller.current;
      if (!box || touched.current) return;
      const el = box.querySelector<HTMLElement>(`[data-post="${startId}"]`);
      if (el) box.scrollTop = el.offsetTop - 52;
    };
    align();
    const a = window.setTimeout(align, 250);
    const b = window.setTimeout(align, 800);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [startId]);

  const patch = (id: string, p: Partial<Post>) => {
    setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
    onPatch(id, p);
  };

  const onLike = async (post: Post) => {
    if (!user || !post.id) return;
    const id = post.id;
    const was = liked.has(id);
    const delta = was ? -1 : 1;
    setLiked((s) => {
      const n = new Set(s);
      if (was) n.delete(id);
      else n.add(id);
      return n;
    });
    patch(id, { likesCount: Math.max(0, post.likesCount + delta) });
    try {
      await toggleLike(post, user.uid, was);
    } catch (e) {
      console.error(e);
      setLiked((s) => {
        const n = new Set(s);
        if (was) n.add(id);
        else n.delete(id);
        return n;
      });
      patch(id, { likesCount: post.likesCount });
    }
  };

  const onDelete = async (post: Post) => {
    if (!post.id || !(await confirm({ title: t('post.deleteConfirm') }))) return;
    try {
      await deletePost(post.id);
      if (isAdmin && post.authorId !== user?.uid) {
        logAdmin('delete_post', 'post', post.id, post.content.slice(0, 80));
      }
      const id = post.id;
      onDeleted(id);
      const rest = items.filter((x) => x.id !== id);
      setItems(rest);
      if (rest.length === 0) onClose();
    } catch (e: any) {
      alert(t('common.error') + ' ' + (e?.message || ''));
    }
  };

  const openPost = items.find((p) => p.id === openId) || null;

  return (
    <div className="fixed inset-0 z-[45] bg-dark-950 flex flex-col animate-fade-in">
      <header className="shrink-0 pt-[env(safe-area-inset-top)] bg-dark-950 border-b border-white/10">
        <div className="max-w-2xl mx-auto h-[52px] px-2 flex items-center gap-1">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"
            aria-label={t('common.back')}
          >
            <ArrowRight className="w-6 h-6 rtl:rotate-0 ltr:rotate-180" />
          </button>
          <h2 className="text-base font-black text-white">{title}</h2>
        </div>
      </header>

      <div
        ref={scroller}
        onTouchStart={() => (touched.current = true)}
        onWheel={() => (touched.current = true)}
        className="flex-1 overflow-y-auto overscroll-contain relative"
      >
        <div className="max-w-2xl mx-auto pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {items.map((post) => {
            const a = pickAuthor(briefs, post.authorId, post.authorName, post.authorPhotoURL);
            const rp = post.repostOfAuthorId
              ? pickAuthor(briefs, post.repostOfAuthorId, '...', undefined).name
              : undefined;
            return (
              <div key={post.id} data-post={post.id}>
                <PostCard
                  post={post}
                  liked={!!post.id && liked.has(post.id)}
                  canDelete={post.authorId === user?.uid || isAdmin}
                  authorName={a.name}
                  authorPhoto={a.photo}
                  repostName={rp}
                  onLike={onLike}
                  onComment={(p) => setOpenId(p.id || null)}
                  onDelete={onDelete}
                />
              </div>
            );
          })}
        </div>
      </div>

      {openPost && (
        <CommentsSheet
          post={openPost}
          onClose={() => {
            const id = openPost.id;
            setOpenId(null);
            if (id) {
              getPostById(id)
                .then((p) => p && patch(id, { commentsCount: p.commentsCount }))
                .catch(console.error);
            }
          }}
        />
      )}
    </div>
  );
};

export default ProfilePostsViewer;
