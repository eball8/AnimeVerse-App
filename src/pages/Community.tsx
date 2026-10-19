import React, { useEffect, useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { subscribeToPosts, getMyLikedPostIds, toggleLike, deletePost } from '../services/postService';
import type { Post } from '../services/postService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { logAdmin } from '../services/adminLog';
import CommentsSheet from '../components/CommentsSheet';
import StoriesBar from '../components/StoriesBar';
import PostCard from '../components/PostCard';
import { useConfirm } from '../components/ConfirmDialog';

const PAGE = 20;

const Community: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [posts, setPosts] = useState<Post[]>([]);
  const [max, setMax] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  // الاسم والصورة يُجلبان حياً من وثيقة المستخدم، فيتحدثان عند تعديل الملف الشخصي
  const briefs = useUserBriefs([
    ...posts.map((p) => p.authorId),
    ...posts.map((p) => p.repostOfAuthorId),
  ]);

  useEffect(() => {
    const unsubscribe = subscribeToPosts((data) => {
      setPosts(data);
      setLoading(false);
    }, max);
    return () => unsubscribe();
  }, [max]);

  useEffect(() => {
    if (!user) return;
    getMyLikedPostIds(user.uid).then(setLiked).catch((e) => console.error(e));
  }, [user]);

  const onLike = async (post: Post) => {
    if (!user || !post.id) return;
    const id = post.id;
    const was = liked.has(id);
    setLiked((s) => {
      const n = new Set(s);
      if (was) n.delete(id);
      else n.add(id);
      return n;
    });
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
    }
  };

  const onDelete = async (post: Post) => {
    if (!post.id || !(await confirm({ title: t('post.deleteConfirm') }))) return;
    try {
      await deletePost(post.id);
      if (isAdmin && post.authorId !== user?.uid) {
        logAdmin('delete_post', 'post', post.id, post.content.slice(0, 80));
      }
    } catch (e: any) {
      alert(t('common.error') + ' ' + (e?.message || ''));
    }
  };

  const openPost = posts.find((p) => p.id === openId) || null;

  return (
    <div className="px-4 py-6 space-y-4 relative">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">{t('nav.community')}</h2>
      </div>

      <StoriesBar />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : posts.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <Users className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm">{t('post.empty')}</p>
        </div>
      ) : (
        <div className="space-y-4 pb-20">
          {posts.map((post) => {
            const a = pickAuthor(briefs, post.authorId, post.authorName, post.authorPhotoURL);
            const rp = post.repostOfAuthorId
              ? pickAuthor(briefs, post.repostOfAuthorId, '...', undefined).name
              : undefined;
            return (
              <PostCard
                key={post.id}
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
            );
          })}

          {posts.length >= max && (
            <button
              onClick={() => setMax((m) => m + PAGE)}
              className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-primary-400 text-xs font-bold"
            >
              {t('common.more')}
            </button>
          )}
        </div>
      )}

      {openPost && <CommentsSheet post={openPost} onClose={() => setOpenId(null)} />}
    </div>
  );
};

export default Community;
