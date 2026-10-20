import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Heart, MessageCircle, Repeat2, Share2, Link2, Volume2, VolumeX, Loader2, Clapperboard,
  Plus, Users, MoreVertical, Trash2,
} from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  deletePost, getFriendsReels, getMyLikedPostIds, getMyRepostMap, getPostById, getReelsPage,
  repostPost, toggleLike,
} from '../services/postService';
import type { Post } from '../services/postService';
import { getMyFollowStates, toggleFollow } from '../services/followService';
import type { FollowState } from '../services/followService';
import { logAdmin } from '../services/adminLog';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { copyText, reelLink, shareLink, videoThumb } from '../utils/links';
import Avatar from '../components/Avatar';
import CommentsSheet from '../components/CommentsSheet';
import { useConfirm } from '../components/ConfirmDialog';

type Tab = 'reels' | 'friends';

const TXT = {
  ar: {
    create: 'إنشاء ريلز أو قصة',
    follow: 'متابعة',
    following: 'متابَع',
    requested: 'تم الطلب',
    friendsEmpty: 'لا توجد فيديوهات أعجب بها أصدقاؤك بعد. الأصدقاء هم الذين تتابعهم ويتابعونك.',
    likedBy: (n: string, extra: number) => `أعجب ${n}${extra > 0 ? ` و${extra} آخرين` : ''} بهذا الفيديو`,
    options: 'خيارات',
    del: 'حذف الريلز',
    followFail: 'تعذّرت المتابعة.',
  },
  en: {
    create: 'Create reel or story',
    follow: 'Follow',
    following: 'Following',
    requested: 'Requested',
    friendsEmpty: 'No videos liked by your friends yet. Friends are people who follow each other.',
    likedBy: (n: string, extra: number) => `${n}${extra > 0 ? ` and ${extra} others` : ''} liked this`,
    options: 'Options',
    del: 'Delete reel',
    followFail: 'Could not update follow.',
  },
};

interface ItemProps {
  post: Post;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  liked: boolean;
  reposted: boolean;
  followState: FollowState;
  isMe: boolean;
  canManage: boolean;
  authorName: string;
  authorPhoto?: string;
  repostName?: string;
  likedByText?: string;
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
  onFollow: (p: Post) => void;
  onMore: (p: Post) => void;
}

const DOUBLE_TAP_MS = 280;

const ReelItem: React.FC<ItemProps> = (p) => {
  const { t, lang } = useI18n();
  const L = lang === 'ar' ? TXT.ar : TXT.en;
  const ref = useRef<HTMLDivElement>(null);
  const vref = useRef<HTMLVideoElement>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<number | null>(null);
  const heartId = useRef(0);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
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

  useEffect(
    () => () => {
      if (tapTimer.current) window.clearTimeout(tapTimer.current);
    },
    []
  );

  const togglePlay = () => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const spawnHeart = (x: number, y: number) => {
    const id = ++heartId.current;
    setHearts((h) => [...h, { id, x, y }]);
    window.setTimeout(() => setHearts((h) => h.filter((i) => i.id !== id)), 850);
  };

  // نقرة واحدة = إيقاف/تشغيل. نقرتان سريعتان = إعجاب مع قلب متحرك.
  const onSurfaceTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (tapTimer.current) {
        window.clearTimeout(tapTimer.current);
        tapTimer.current = null;
      }
      lastTap.current = 0;
      const rect = e.currentTarget.getBoundingClientRect();
      spawnHeart(e.clientX - rect.left, e.clientY - rect.top);
      if (!liked) p.onLike(post); // الضغط المزدوج يضيف إعجاباً فقط ولا يلغيه
      return;
    }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null;
      togglePlay();
    }, DOUBLE_TAP_MS);
  };

  const railBtn = 'flex flex-col items-center gap-1 text-white drop-shadow active:scale-90 transition-transform';
  const followLabel = p.followState === 'following' ? L.following : p.followState === 'requested' ? L.requested : L.follow;

  return (
    <div ref={ref} className="snap-start snap-always h-full w-full relative bg-black overflow-hidden">
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
          className="w-full h-full object-contain"
        />
      ) : (
        <img src={videoThumb(post.mediaUrl)} alt="" className="w-full h-full object-contain" />
      )}

      {/* طبقة اللمس: نقرة = تشغيل/إيقاف، نقرتان = إعجاب */}
      <div className="absolute inset-0" onClick={onSurfaceTap} />

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* قلوب الضغط المزدوج */}
      {hearts.map((h) => (
        <Heart
          key={h.id}
          className="absolute w-24 h-24 fill-red-500 text-red-500 pointer-events-none drop-shadow-lg"
          style={{ left: h.x - 48, top: h.y - 48, animation: 'avHeartPop 0.85s ease-out forwards' }}
        />
      ))}

      {/* الأزرار الجانبية */}
      <div className="absolute end-3 bottom-8 flex flex-col items-center gap-5 z-10">
        <button onClick={() => p.onLike(post)} className={railBtn} aria-label="like">
          <Heart className={`w-7 h-7 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
          <span className="text-[11px] font-bold">{post.likesCount}</span>
        </button>
        <button onClick={() => p.onComment(post)} className={railBtn} aria-label="comments">
          <MessageCircle className="w-7 h-7" />
          <span className="text-[11px] font-bold">{post.commentsCount}</span>
        </button>
        <button onClick={() => p.onRepost(post)} className={railBtn} aria-label={t('reels.repost')}>
          <Repeat2 className={`w-7 h-7 ${p.reposted ? 'text-primary-400' : ''}`} strokeWidth={p.reposted ? 3 : 2} />
        </button>
        <button onClick={() => p.onShare(post)} className={railBtn} aria-label={t('common.share')}>
          <Share2 className="w-6 h-6" />
        </button>
        <button onClick={() => p.onCopy(post)} className={railBtn} aria-label={t('common.copyLink')}>
          <Link2 className="w-6 h-6" />
        </button>
        <button onClick={p.onToggleMute} className={railBtn} aria-label="mute">
          {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
        {p.canManage && (
          <button onClick={() => p.onMore(post)} className={railBtn} aria-label={L.options}>
            <MoreVertical className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* معلومات الناشر */}
      <div className="absolute start-3 end-20 bottom-6 space-y-2 pointer-events-none z-10">
        {p.likedByText && (
          <p className="text-[11px] text-white/90 flex items-center gap-1">
            <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" /> {p.likedByText}
          </p>
        )}
        {p.repostName && (
          <p className="text-[11px] text-white/80 flex items-center gap-1">
            <Repeat2 className="w-3.5 h-3.5" /> {t('post.repostedFrom', { name: p.repostName })}
          </p>
        )}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button onClick={() => p.onOpenAuthor(post.authorId)} className="flex items-center gap-2 min-w-0">
            <Avatar
              src={p.authorPhoto}
              seed={post.authorId}
              name={p.authorName}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/60 bg-dark-900 shrink-0"
            />
            <span className="text-sm font-black text-white drop-shadow truncate">{p.authorName}</span>
          </button>
          {!p.isMe && (
            <button
              onClick={() => p.onFollow(post)}
              className={`shrink-0 px-3 py-1 rounded-lg text-[11px] font-black border active:scale-95 transition ${
                p.followState === 'none'
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'bg-white/10 border-white/60 text-white'
              }`}
            >
              {followLabel}
            </button>
          )}
        </div>
        {post.content && <p className="text-xs text-white/90 line-clamp-3 break-words">{post.content}</p>}
      </div>
    </div>
  );
};

const Reels: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, profile, isAdmin } = useAuth();
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const L = lang === 'ar' ? TXT.ar : TXT.en;

  const [tab, setTab] = useState<Tab>('reels');
  const [items, setItems] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [follows, setFollows] = useState<Record<string, FollowState>>({});
  const [reposts, setReposts] = useState<Record<string, string>>({});
  const [likers, setLikers] = useState<Record<string, string[]>>({});
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  const [toast, setToast] = useState('');
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const loadingMore = useRef(false);
  const repostBusy = useRef<Set<string>>(new Set());
  const followBusy = useRef<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const likerIds = Object.values(likers).reduce<string[]>((a, b) => a.concat(b), []);
  const briefs = useUserBriefs([
    ...items.map((x) => x.authorId),
    ...items.map((x) => x.repostOfAuthorId),
    ...likerIds,
  ]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 1800);
  };

  // تحميل الخلاصة (حسب التبويب)
  useEffect(() => {
    let off = false;
    setLoading(true);
    setActive(0);
    cursorRef.current = null;
    loadingMore.current = false;
    (async () => {
      if (tab === 'friends') {
        if (!user) {
          setItems([]);
          setDone(true);
          return;
        }
        const res = await getFriendsReels(user.uid);
        if (off) return;
        const map: Record<string, string[]> = {};
        res.forEach((r) => {
          if (r.post.id) map[r.post.id] = r.likedBy;
        });
        setLikers(map);
        setItems(res.map((r) => r.post));
        setDone(true);
        return;
      }
      const first = id ? await getPostById(id).catch(() => null) : null;
      const page = await getReelsPage(null);
      if (off) return;
      cursorRef.current = page.cursor;
      setDone(page.done);
      setLikers({});
      setItems(
        first && first.mediaType === 'video'
          ? [first, ...page.items.filter((x) => x.id !== first.id)]
          : page.items
      );
    })()
      .catch((e) => console.error(e))
      .finally(() => {
        if (!off) setLoading(false);
      });
    return () => {
      off = true;
    };
  }, [id, tab, user?.uid]);

  // إعجاباتي + متابعاتي + إعادات نشري
  useEffect(() => {
    if (!user) return;
    getMyLikedPostIds(user.uid).then(setLiked).catch(console.error);
    getMyFollowStates(user.uid).then(setFollows).catch(console.error);
    getMyRepostMap(user.uid).then(setReposts).catch(console.error);
  }, [user?.uid]);

  // تحميل صفحة جديدة عندما نقترب من النهاية (تبويب Reels فقط)
  useEffect(() => {
    if (tab !== 'reels' || done || loading || loadingMore.current) return;
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
  }, [tab, active, items.length, done, loading]);

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

  // إعادة النشر: تبديل فوري بدون تأكيد وبدون إشعارات عند الإلغاء
  const onRepost = async (post: Post) => {
    if (!user || !profile || !post.id) return;
    const orig = post.repostOfId || post.id;
    if (repostBusy.current.has(orig)) return;
    repostBusy.current.add(orig);
    const existing = reposts[orig];
    try {
      if (existing) {
        setReposts((prev) => {
          const n = { ...prev };
          delete n[orig];
          return n;
        });
        try {
          await deletePost(existing);
        } catch (e) {
          setReposts((prev) => ({ ...prev, [orig]: existing }));
          throw e;
        }
      } else {
        setReposts((prev) => ({ ...prev, [orig]: 'pending' }));
        try {
          const newId = await repostPost(post, {
            uid: user.uid,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
          });
          setReposts((prev) => ({ ...prev, [orig]: newId }));
        } catch (e) {
          setReposts((prev) => {
            const n = { ...prev };
            delete n[orig];
            return n;
          });
          throw e;
        }
      }
    } catch (e) {
      console.error(e);
      showToast(t('reels.repostFail'));
    } finally {
      repostBusy.current.delete(orig);
    }
  };

  const onFollow = async (post: Post) => {
    if (!user) return;
    const target = post.authorId;
    if (target === user.uid || followBusy.current.has(target)) return;
    followBusy.current.add(target);
    const cur = follows[target] ?? 'none';
    // تحديث فوري للواجهة (متفائل)
    setFollows((prev) => ({ ...prev, [target]: cur === 'none' ? 'following' : 'none' }));
    try {
      const next = await toggleFollow(user.uid, target, cur);
      setFollows((prev) => ({ ...prev, [target]: next }));
    } catch (e) {
      console.error(e);
      setFollows((prev) => ({ ...prev, [target]: cur }));
      showToast(L.followFail);
    } finally {
      followBusy.current.delete(target);
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

  const onDelete = async (post: Post) => {
    if (!post.id) return;
    if (!(await confirm({ title: t('post.deleteConfirm') }))) return;
    try {
      await deletePost(post.id);
      if (isAdmin && post.authorId !== user?.uid) {
        logAdmin('delete_post', 'post', post.id, (post.content || '').slice(0, 80));
      }
      setItems((prev) => prev.filter((x) => x.id !== post.id));
      setActive((a) => Math.max(0, Math.min(a, items.length - 2)));
      setReposts((prev) => {
        const n = { ...prev };
        Object.keys(n).forEach((k) => {
          if (n[k] === post.id) delete n[k];
        });
        return n;
      });
    } catch (e) {
      console.error(e);
      showToast(t('common.error'));
    }
  };

  const likedByText = (pid?: string): string | undefined => {
    if (tab !== 'friends' || !pid) return undefined;
    const ids = likers[pid];
    if (!ids || ids.length === 0) return undefined;
    return L.likedBy(pickAuthor(briefs, ids[0], '...').name, ids.length - 1);
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-30 bg-black force-dark"
      style={{ bottom: 'var(--app-nav-h, calc(3.7rem + env(safe-area-inset-bottom)))' }}
    >
      {/* حركة قلب الإعجاب */}
      <style>{`@keyframes avHeartPop{0%{transform:scale(0.3);opacity:0}20%{transform:scale(1.15);opacity:1}45%{transform:scale(0.95)}100%{transform:scale(1.25) translateY(-30px);opacity:0}}`}</style>

      <div className="max-w-2xl mx-auto h-full relative">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
            {tab === 'friends' ? <Users className="w-12 h-12 text-slate-600" /> : <Clapperboard className="w-12 h-12 text-slate-600" />}
            <p className="text-sm text-slate-400">{tab === 'friends' ? L.friendsEmpty : t('reels.empty')}</p>
            {tab === 'reels' && (
              <button onClick={() => navigate('/create-post')} className="btn-primary px-6 py-2">
                +
              </button>
            )}
          </div>
        ) : (
          <div ref={rootRef} className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar">
            {items.map((post, i) => {
              const a = pickAuthor(briefs, post.authorId, post.authorName, post.authorPhotoURL);
              const rp = post.repostOfAuthorId ? pickAuthor(briefs, post.repostOfAuthorId, '...').name : undefined;
              const orig = post.repostOfId || post.id || '';
              const isMe = post.authorId === user?.uid;
              return (
                <ReelItem
                  key={post.id}
                  post={post}
                  index={i}
                  active={i === active}
                  near={Math.abs(i - active) <= 1}
                  muted={muted}
                  liked={!!post.id && liked.has(post.id)}
                  reposted={!!orig && !!reposts[orig]}
                  followState={follows[post.authorId] ?? 'none'}
                  isMe={isMe}
                  canManage={isMe || isAdmin}
                  authorName={a.name}
                  authorPhoto={a.photo}
                  repostName={rp}
                  likedByText={likedByText(post.id)}
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
                  onFollow={onFollow}
                  onMore={setMenuPost}
                />
              );
            })}
          </div>
        )}

        {/* تدرّج علوي + زر الإنشاء (+) + تبويبات Reels | Friends */}
        <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
        <div
          className="absolute top-0 inset-x-0 z-20 pointer-events-none"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)' }}
        >
          <div className="relative flex items-center justify-center px-3 h-10">
            <button
              onClick={() => navigate('/create-post')}
              aria-label={L.create}
              title={L.create}
              className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/35 backdrop-blur border border-white/25 flex items-center justify-center text-white active:scale-90 transition"
            >
              <Plus className="w-5 h-5" />
            </button>

            <div className="pointer-events-auto flex items-center gap-4" dir="ltr">
              {(['reels', 'friends'] as Tab[]).map((k, idx) => (
                <React.Fragment key={k}>
                  {idx === 1 && <span className="w-px h-4 bg-white/40" />}
                  <button
                    onClick={() => tab !== k && setTab(k)}
                    className={`text-[15px] font-black drop-shadow pb-0.5 border-b-2 transition ${
                      tab === k ? 'text-white border-white' : 'text-white/60 border-transparent'
                    }`}
                  >
                    {k === 'reels' ? 'Reels' : 'Friends'}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {toast && (
          <div className="absolute top-20 inset-x-0 flex justify-center pointer-events-none z-30">
            <span className="px-4 py-2 rounded-full bg-black/80 text-white text-xs font-bold">{toast}</span>
          </div>
        )}
      </div>

      {commentPost && (
        <CommentsSheet
          post={commentPost}
          onClose={() => setCommentPost(null)}
          onCountChange={(n) => patch(commentPost.id, (x) => ({ ...x, commentsCount: n }))}
        />
      )}

      {/* قائمة خيارات الريلز (حذف) */}
      {menuPost &&
        createPortal(
          <div className="fixed inset-0 z-[90] bg-black/70 flex items-end" onClick={() => setMenuPost(null)}>
            <div
              className="w-full max-w-2xl mx-auto bg-dark-900 border-t border-white/10 rounded-t-3xl p-4 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  const target = menuPost;
                  setMenuPost(null);
                  onDelete(target);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 active:bg-red-500/20 transition"
              >
                <Trash2 className="w-5 h-5" /> {L.del}
              </button>
              <button
                onClick={() => setMenuPost(null)}
                className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-300 text-sm font-bold"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Reels;
