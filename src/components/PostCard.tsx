import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Link2, Check, Repeat2, Clapperboard } from 'lucide-react';
import type { Post } from '../services/postService';
import Avatar from './Avatar';
import DeleteButton from './DeleteButton';
import { timeAgo } from '../utils/timeAgo';
import { copyText, postLink, reelLink, shareLink, videoThumb } from '../utils/links';
import { useI18n } from '../i18n/I18nContext';

interface Props {
  post: Post;
  liked: boolean;
  canDelete: boolean;
  authorName: string;
  authorPhoto?: string;
  repostName?: string;
  onLike: (p: Post) => void;
  onComment: (p: Post) => void;
  onDelete: (p: Post) => void;
}

const PostCard: React.FC<Props> = ({
  post, liked, canDelete, authorName, authorPhoto, repostName, onLike, onComment, onDelete,
}) => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [flash, setFlash] = useState(false);

  const isVideo = post.mediaType === 'video';
  const url = post.id ? (isVideo ? reelLink(post.id) : postLink(post.id)) : '';

  const doFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
  };

  const onCopy = async () => {
    if (url && (await copyText(url))) doFlash();
  };

  const onShare = async () => {
    if (!url) return;
    const r = await shareLink(url, authorName);
    if (r === 'copied') doFlash();
  };

  return (
    <div className="card p-4 space-y-3">
      {repostName && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Repeat2 className="w-3.5 h-3.5" /> {t('post.repostedFrom', { name: repostName })}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/user/${post.authorId}`)} className="shrink-0">
          <Avatar
            src={authorPhoto}
            seed={post.authorId}
            name={authorName}
            className="w-10 h-10 rounded-full object-cover bg-dark-900 ring-1 ring-white/10"
          />
        </button>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white truncate">{authorName}</h4>
          <p className="text-[10px] text-slate-500">{timeAgo(post.createdAt, lang)}</p>
        </div>
        {canDelete && (
          <DeleteButton variant="soft" label={t('common.delete')} onClick={() => onDelete(post)} />
        )}
      </div>

      {post.content && <p className="text-sm text-slate-200 break-words">{post.content}</p>}

      {post.mediaUrl && (
        <div className="rounded-2xl overflow-hidden bg-black border border-white/5 relative">
          {isVideo ? (
            <>
              <video
                src={post.mediaUrl}
                poster={videoThumb(post.mediaUrl)}
                controls
                playsInline
                preload="none"
                className="w-full max-h-[400px] object-contain"
              />
              {post.id && (
                <button
                  onClick={() => navigate(`/reels/${post.id}`)}
                  className="absolute top-2 end-2 p-1.5 rounded-lg bg-black/60 text-white"
                  aria-label="Reels"
                >
                  <Clapperboard className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <img src={post.mediaUrl} alt="media" loading="lazy" className="w-full max-h-[400px] object-cover" />
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <button
          onClick={() => onLike(post)}
          className={`flex items-center gap-1.5 transition ${liked ? 'text-red-400' : 'text-slate-400'}`}
        >
          <Heart className={`w-5 h-5 ${liked ? 'fill-red-400' : ''}`} />
          <span className="text-xs">{post.likesCount}</span>
        </button>
        <button onClick={() => onComment(post)} className="flex items-center gap-1.5 text-slate-400">
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs">{post.commentsCount}</span>
        </button>
        <button onClick={onCopy} className="flex items-center gap-1.5 text-slate-400" aria-label={t('common.copyLink')}>
          {flash ? <Check className="w-5 h-5 text-emerald-400" /> : <Link2 className="w-5 h-5" />}
        </button>
        <button onClick={onShare} className="flex items-center gap-1.5 text-slate-400" aria-label={t('common.share')}>
          <Share2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default PostCard;
