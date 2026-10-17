import React, { useEffect, useState } from 'react';
import { Users, Heart, MessageCircle, Share2, Loader2 } from 'lucide-react';
import { subscribeToPosts } from '../services/postService';
import type { Post } from '../services/postService';

const Community: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToPosts((data: Post[]) => {
      setPosts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="px-4 py-6 space-y-4 relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary-400" />
          <h2 className="text-xl font-black text-white">المجتمع</h2>
        </div>
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
          {posts.map((post) => (
            <div key={post.id} className="card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <img src={post.authorPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.authorId}`} alt="" className="w-10 h-10 rounded-full bg-dark-900 ring-1 ring-white/10" />
                <div>
                  <h4 className="text-sm font-bold text-white">{post.authorName}</h4>
                  <p className="text-[10px] text-slate-500">الآن</p>
                </div>
              </div>
              {post.content && <p className="text-sm text-slate-200">{post.content}</p>}
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
                <button className="flex items-center gap-1.5 text-slate-400 hover:text-red-400 transition">
                  <Heart className="w-5 h-5" /> <span className="text-xs">{post.likesCount}</span>
                </button>
                <button className="flex items-center gap-1.5 text-slate-400 hover:text-blue-400 transition">
                  <MessageCircle className="w-5 h-5" /> <span className="text-xs">{post.commentsCount}</span>
                </button>
                <button className="flex items-center gap-1.5 text-slate-400 hover:text-green-400 transition">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Community;
