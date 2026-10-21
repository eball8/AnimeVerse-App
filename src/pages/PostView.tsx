import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { deletePost, getMyLikedPostIds, getPostById, toggleLike } from '../services/postService';
import type { Post } from '../services/postService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import PostCard from '../components/PostCard';
import CommentsSheet from '../components/CommentsSheet';
import { useConfirm } from '../components/ConfirmDialog';

const PostView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const briefs = useUserBriefs([post?.authorId, post?.repostOfAuthorId]);

  useEffect(() => {
    if (!id) return;
    getPostById(id)
      .then((p) => {
        // أي منشور فيديو (من إشعار/رابط/بحث) يُفتح في شاشة الريلز
        if (p && p.mediaType === 'video' && p.mediaUrl) {
          navigate(`/reels/${id}`, { replace: true });
          return;
        }
        setPost(p);
      })
      .catch((e) => {
        console.error(e);
        setPost(null);
      });
  }, [id, navigate]);

  useEffect(() => {
    if (!user || !id) return;
    getMyLikedPostIds(user.uid)
      .then((s) => setLiked(s.has(id)))
      .catch(console.error);
  }, [user, id]);

  const onLike = async (p: Post) => {
    if (!user) return;
    const was = liked;
    setLiked(!was);
    setPost((x) => (x ? { ...x, likesCount: Math.max(0, x.likesCount + (was ? -1 : 1)) } : x));
    try {
      await toggleLike(p, user.uid, was);
    } catch (e) {
      console.error(e);
      setLiked(was);
      setPost((x) => (x ? { ...x, likesCount: Math.max(0, x.likesCount + (was ? 1 : -1)) } : x));
    }
  };

  const onDelete = async (p: Post) => {
    if (!p.id || !(await confirm({ title: t('post.deleteConfirm') }))) return;
    try {
      await deletePost(p.id);
      navigate('/community', { replace: true });
    } catch (e) {
      console.error(e);
    }
  };

  const refreshCount = () => {
    if (id) getPostById(id).then((p) => p && setPost(p)).catch(console.error);
  };

  return (
    <div className="py-3">
      <button onClick={() => navigate(-1)} className="mx-3 mb-1 p-2 rounded-xl hover:bg-white/10 text-slate-300" aria-label={t('common.back')}>
        <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
      </button>

      {post === undefined ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : post === null ? (
        <p className="text-center text-sm text-slate-400 py-16">{t('post.notFound')}</p>
      ) : (
        <>
          {(() => {
            const a = pickAuthor(briefs, post.authorId, post.authorName, post.authorPhotoURL);
            const rp = post.repostOfAuthorId ? pickAuthor(briefs, post.repostOfAuthorId, '...').name : undefined;
            return (
              <PostCard
                post={post}
                liked={liked}
                canDelete={post.authorId === user?.uid || isAdmin}
                authorName={a.name}
                authorPhoto={a.photo}
                repostName={rp}
                onLike={onLike}
                onComment={() => setShowComments(true)}
                onDelete={onDelete}
              />
            );
          })()}
          {showComments && (
            <CommentsSheet
              post={post}
              onClose={() => {
                setShowComments(false);
                refreshCount();
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default PostView;
