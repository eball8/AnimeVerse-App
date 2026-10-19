import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, MessageCircle, Repeat2, Share2, Link2, Volume2, VolumeX, Loader2, Clapperboard } from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  getMyLikedPostIds, getPostById, getReelsPage, repostPost, toggleLike,
} from '../services/postService';
import type { Post } from '../services/postService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { copyText, reelLink, shareLink, videoThumb } from '../utils/links';
import Avatar from '../components/Avatar';
import CommentsSheet from '../components/CommentsSheet';

interface ItemProps {
  post: Post;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  liked: boolean;
  authorName: string;
  authorPhoto?: string;
  repostName?: string;
  root: React.RefObject<HTMLDivElement>;
  onVisible: (i: number) => void;
  onToggleMute: () => void;
  onAutoplayBlocked: () => void;
  onLike: (p: Post) => void;
  onComment: (p: Post) => void;
  onRepost: (p: Post) => void;
  onShare: (p: Post) => void;
  onCopy: (p: Post) => void;
  onOpenAuthor: (uid: string) => void;
}

const ReelItem: React.FC<ItemProps> = (p) => {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const vref = useRef<HTMLVideoElement>(null);
  const { post, active, near, muted, liked } = p;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) p.onVisible(p.index);
      },
      { root: p.root.current, threshold: [0.6] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [p.index, p.onVisible, p.root]);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    v.muted = muted;
    if (active) {
      v.play().catch(() => {
        // المتصفح منع التشغيل بالصوت: نشغّله بدون صوت ونُظهر زر الكتم
        if (!v.muted) {
          v.muted = true;
          p.onAutoplayBlocked();
          v.play().catch(() => {});
        }
      });
    } else v.pause();
  }, [active, near, muted]);

  const togglePlay = () => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const railBtn = 'flex flex-col items-center gap-1 text-white drop-shadow active:scale-90 transition-transform';

  return (
    <div ref={ref} className="snap-start snap-always h-full w-full relative bg-black">
      {near && post.mediaUrl ? (
        <video
          ref={vref}
          src={post.mediaUrl}
          poster={videoThumb(post.mediaUrl)}
          loop
          playsInline
          muted={muted}
          autoPlay={active}
          preload={active ? 'auto' : 'metadata'}
          onClick={togglePlay}
          className="w-full h-full object-contain"
        />
      ) : (
        <img src={videoThumb(post.mediaUrl)} alt="" className="w-full h-full object-contain" />
      )}

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* الأزرار الجانبية */}
      <div className="absolute end-3 bottom-8 flex flex-col items-center gap-5">
        <button onClick={() => p.onLike(post)} className={railBtn}>
          <Heart className={`w-7 h-7 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
          <span className="text-[11px] font-bold">{post.likesCount}</span>
        </button>
        <button onClick={() => p.onComment(post)} className={railBtn}>
          <MessageCircle className="w-7 h-7" />
          <span className="text-[11px] font-bold">{post.commentsCount}</span>
        </button>
        <button onClick={() => p.onRepost(post)} className={railBtn} aria-label={t('reels.repost')}>
          <Repeat2 className="w-7 h-7" />
        </button>
        <button onClick={() => p.onShare(post)} className={railBtn} aria-label={t('common.share')}>
          <Share2 className="w-6 h-6" />
        </button>
        <button onClick={() => p.onCopy(post)} className={railBtn} aria-label={t('common.copyLink')}>
          <Link2 className="w-6 h-6" />
        </button>
        <button onClick={p.onToggleMute} className={railBtn}>
          {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
      </div>

      {/* معلومات الناشر */}
      <div className="absolute start-3 end-20 bottom-6 space-y-2">
        {p.repostName && (
          <p className="text-[11px] text-white/80 flex items-center gap-1">
            <Repeat2 className="w-3.5 h-3.5" /> {t('post.repostedFrom', { name: p.repostName })}
          </p>
        )}
        <button onClick={() => p.onOpenAuthor(post.authorId)} className="flex items-center gap-2">
          <Avatar
            src={p.authorPhoto}
            seed={post.authorId}
            name={p.authorName}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-white/60 bg-dark-900"
          />
          <span className="text-sm font-black text-white drop-shadow">{p.authorName}</span>
        </button>
        {post.content && <p className="text-xs text-white/90 line-clamp-3 break-words">{post.content}</p>}
      </div>
    </div>
  );
};

const Reels: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t } = useI18n();

  const [items, setItems] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [toast, setToast] = useState('');
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const loadingMore = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const briefs = useUserBriefs([
    ...items.map((x) => x.authorId),
    ...items.map((x) => x.repostOfAuthorId),
  ]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  useEffect(() => {
    let off = false;
    setLoading(true);
    (async () => {
      const first = id ? await getPostById(id).catch(() => null) : null;
      const page = await getReelsPage(null);
      if (off) return;
      cursorRef.current = page.cursor;
      setDone(page.done);
      const list =
        first && first.mediaType === 'video'
          ? [first, ...page.items.filter((x) => x.id !== first.id)]
          : page.items;
      setItems(list);
      setActive(0);
      setLoading(false);
    })().catch((e) => {
      console.error(e);
      if (!off) setLoading(false);
    });
    return () => {
      off = true;
    };
  }, [id]);

  useEffect(() => {
    if (!user) return;
    getMyLikedPostIds(user.uid).then(setLiked).catch(console.error);
  }, [user]);

  // تحميل صفحة جديدة عندما نقترب من النهاية
  useEffect(() => {
    if (done || loading || loadingMore.current) return;
    if (active < items.length - 3) return;
    loadingMore.current = true;
    getReelsPage(cursorRef.current)
      .then((page) => {
        cursorRef.current = page.cursor;
        setDone(page.done);
        setItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...page.items.filter((x) => !seen.has(x.id))];
        });
      })
      .catch(console.error)
      .finally(() => {
        loadingMore.current = false;
      });
  }, [active, items.length, done, loading]);

  const onVisible = useCallback((i: number) => setActive(i), []);

  const patch = (pid: string | undefined, fn: (x: Post) => Post) =>
    setItems((prev) => prev.map((x) => (x.id === pid ? fn(x) : x)));

  const onLike = async (post: Post) => {
    if (!user || !post.id) return;
    const pid = post.id;
    const was = liked.has(pid);
    setLiked((s) => {
      const n = new Set(s);
      if (was) n.delete(pid);
      else n.add(pid);
      return n;
    });
    patch(pid, (x) => ({ ...x, likesCount: Math.max(0, x.likesCount + (was ? -1 : 1)) }));
    try {
      await toggleLike(post, user.uid, was);
    } catch (e) {
      console.error(e);
      setLiked((s) => {
        const n = new Set(s);
        if (was) n.add(pid);
        else n.delete(pid);
        return n;
      });
      patch(pid, (x) => ({ ...x, likesCount: Math.max(0, x.likesCount + (was ? 1 : -1)) }));
    }
  };

  const onRepost = async (post: Post) => {
    if (!user || !profile) return;
    if (!confirm(t('reels.repostConfirm'))) return;
    try {
      await repostPost(post, { uid: user.uid, displayName: profile.displayName, photoURL: profile.photoURL });
      showToast(t('reels.repostDone'));
    } catch (e) {
      console.error(e);
      showToast(t('reels.repostFail'));
    }
  };

  const onShare = async (post: Post) => {
    if (!post.id) return;
    const a = pickAuthor(briefs, post.authorId, post.authorName);
    const r = await shareLink(reelLink(post.id), a.name);
    if (r === 'copied') showToast(t('common.linkCopied'));
  };

  const onCopy = async (post: Post) => {
    if (!post.id) return;
    if (await copyText(reelLink(post.id))) showToast(t('common.linkCopied'));
  };

  const closeComments = () => {
    const pid = commentPost?.id;
    setCommentPost(null);
    if (pid) {
      getPostById(pid)
        .then((fresh) => fresh && patch(pid, (x) => ({ ...x, commentsCount: fresh.commentsCount })))
        .catch(console.error);
    }
  };

  return (
    <div
      className="fixed inset-x-0 z-30 bg-black"
      style={{ top: 'calc(3.3rem + env(safe-area-inset-top))', bottom: 'calc(3.7rem + env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-2xl mx-auto h-full relative">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
            <Clapperboard className="w-12 h-12 text-slate-600" />
            <p className="text-sm text-slate-400">{t('reels.empty')}</p>
            <button onClick={() => navigate('/create-post')} className="btn-primary px-6 py-2">
              +
            </button>
          </div>
        ) : (
          <div ref={rootRef} className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar">
            {items.map((post, i) => {
              const a = pickAuthor(briefs, post.authorId, post.authorName, post.authorPhotoURL);
              const rp = post.repostOfAuthorId ? pickAuthor(briefs, post.repostOfAuthorId, '...').name : undefined;
              return (
                <ReelItem
                  key={post.id}
                  post={post}
                  index={i}
                  active={i === active}
                  near={Math.abs(i - active) <= 1}
                  muted={muted}
                  liked={!!post.id && liked.has(post.id)}
                  authorName={a.name}
                  authorPhoto={a.photo}
                  repostName={rp}
                  root={rootRef}
                  onVisible={onVisible}
                  onToggleMute={() => setMuted((m) => !m)}
                  onAutoplayBlocked={() => setMuted(true)}
                  onLike={onLike}
                  onComment={setCommentPost}
                  onRepost={onRepost}
                  onShare={onShare}
                  onCopy={onCopy}
                  onOpenAuthor={(uid) => navigate(`/user/${uid}`)}
                />
              );
            })}
          </div>
        )}

        {toast && (
          <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
            <span className="px-4 py-2 rounded-full bg-black/80 text-white text-xs font-bold">{toast}</span>
          </div>
        )}
      </div>

      {commentPost && <CommentsSheet post={commentPost} onClose={closeComments} />}
    </div>
  );
};

export default Reels;
