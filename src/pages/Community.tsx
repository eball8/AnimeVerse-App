import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Heart, MessageCircle, Share2, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeToPosts, getMyLikedPostIds, toggleLike, deletePost } from '../services/postService';
import type { Post } from '../services/postService';
import { logAdmin } from '../services/adminLog';
import { timeAgo } from '../utils/timeAgo';
import CommentsSheet from '../components/CommentsSheet';

const Community: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToPosts((data) => {
      setPosts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
    if (!post.id || !confirm('حذف هذا المنشور؟')) return;
    try {
      await deletePost(post.id);
      if (isAdmin && post.authorId !== user?.uid) {
        logAdmin('delete_post', 'post', post.id, post.content.slice(0, 80));
      }
    } catch (e: any) {
      alert('تعذّر الحذف: ' + (e?.message || ''));
    }
  };

  const onShare = async (post: Post) => {
    const text = `${post.authorName}: ${post.content}`.slice(0, 200);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AnimeVerse', text });
      } catch {
        /* ignore */
      }
    } else {
      await navigator.clipboard.writeText(text);
      alert('تم النسخ');
    }
  };

  const openPost = posts.find((p) => p.id === openId) || null;

  return (
    <div className="px-4 py-6 space-y-4 relative">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">المجتمع</h2>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : posts.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <Users className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm">لا توجد منشورات بعد. كن أول من ينشر!</p>
        </div>
      ) : (
        <div className="space-y-4 pb-20">
          {posts.map((post) => {
            const isLiked = !!post.id && liked.has(post.id);
            return (
              <div key={post.id} className="card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => navigate(`/user/${post.authorId}`)} className="shrink-0">
                    <img
                      src={post.authorPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.authorId}`}
                      alt=""
                      className="w-10 h-10 rounded-full bg-dark-900 ring-1 ring-white/10"
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{post.authorName}</h4>
                    <p className="text-[10px] text-slate-500">{timeAgo(post.createdAt)}</p>
                  </div>
                  {(post.authorId === user?.uid || isAdmin) && (
                    <button onClick={() => onDelete(post)} className="p-2 text-red-400" aria-label="حذف">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {post.content && <p className="text-sm text-slate-200 break-words">{post.content}</p>}
                {post.mediaUrl && (
                  <div className="rounded-2xl overflow-hidden bg-black border border-white/5">
                    {post.mediaType === 'video' ? (
                      <video src={post.mediaUrl} controls className="w-full max-h-[400px] object-contain" />
                    ) : (
                      <img src={post.mediaUrl} alt="media" className="w-full max-h-[400px] object-cover" />
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <button
                    onClick={() => onLike(post)}
                    className={`flex items-center gap-1.5 transition ${isLiked ? 'text-red-400' : 'text-slate-400'}`}
                  >
                    <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-400' : ''}`} />
                    <span className="text-xs">{post.likesCount}</span>
                  </button>
                  <button
                    onClick={() => setOpenId(post.id || null)}
                    className="flex items-center gap-1.5 text-slate-400"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-xs">{post.commentsCount}</span>
                  </button>
                  <button onClick={() => onShare(post)} className="flex items-center gap-1.5 text-slate-400">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openPost && <CommentsSheet post={openPost} onClose={() => setOpenId(null)} />}
    </div>
  );
};

export default Community;
