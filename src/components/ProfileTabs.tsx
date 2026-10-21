import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Clapperboard, Repeat2, AtSign, Play, Lock, Loader2, Heart } from 'lucide-react';
import { getUserPosts, getMentionedPosts } from '../services/postService';
import type { Post } from '../services/postService';
import { videoThumb } from '../utils/links';
import ProfilePostsViewer from './ProfilePostsViewer';
import { useI18n } from '../i18n/I18nContext';

type TabKey = 'posts' | 'reels' | 'reposts' | 'mentions';

const TABS: { key: TabKey; icon: React.ElementType }[] = [
  { key: 'posts', icon: LayoutGrid },
  { key: 'reels', icon: Clapperboard },
  { key: 'reposts', icon: Repeat2 },
  { key: 'mentions', icon: AtSign },
];

const ms = (p: Post) => p.createdAt?.toMillis?.() ?? 0;

const Tile: React.FC<{ post: Post; tall?: boolean; onOpen: () => void }> = ({ post, tall, onOpen }) => {
  const isVideo = post.mediaType === 'video' && !!post.mediaUrl;
  const hasImage = !!post.mediaUrl && post.mediaType !== 'video';
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = isVideo ? videoThumb(post.mediaUrl) : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative block w-full overflow-hidden bg-dark-900 ${tall ? 'aspect-[3/4]' : 'aspect-[4/5]'}`}
    >
      {hasImage && (
        <img src={post.mediaUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
      )}
      {isVideo && thumb && !thumbFailed && (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setThumbFailed(true)}
          className="w-full h-full object-cover"
        />
      )}
      {isVideo && (!thumb || thumbFailed) && (
        <video src={`${post.mediaUrl}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
      )}
      {!post.mediaUrl && (
        <div className="w-full h-full p-2 flex items-center justify-center text-center bg-gradient-to-br from-primary-500/20 to-accent-500/20">
          <p className="text-[11px] font-bold text-white line-clamp-5 break-words">{post.content}</p>
        </div>
      )}

      {isVideo && (
        <span className="absolute top-1.5 end-1.5 p-1 rounded-full bg-black/50 text-white">
          <Play className="w-3 h-3 fill-white" />
        </span>
      )}
      {post.repostOfId && (
        <span className="absolute top-1.5 start-1.5 p-1 rounded-full bg-black/50 text-white">
          <Repeat2 className="w-3 h-3" />
        </span>
      )}
      <span className="absolute bottom-1 start-1.5 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow">
        <Heart className="w-3 h-3 fill-white" /> {post.likesCount || 0}
      </span>
    </button>
  );
};

const ProfileTabs: React.FC<{ uid: string; canView?: boolean }> = ({ uid, canView = true }) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [active, setActive] = useState<TabKey>('posts');
  const [mine, setMine] = useState<Post[]>([]);
  const [tagged, setTagged] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([getUserPosts(uid), getMentionedPosts(uid).catch(() => [] as Post[])])
      .then(([a, b]) => {
        if (cancelled) return;
        setMine(a);
        setTagged(b);
      })
      .catch((e) => {
        console.error('profile posts failed:', e);
        if (!cancelled) setError('load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, canView]);

  const lists = useMemo(() => {
    const own = mine.filter((p) => !p.repostOfId);
    const collab = mine.filter((p) => (p.collaborators?.length ?? 0) > 0);
    const seen = new Set<string>();
    const mentions = [...tagged, ...collab]
      .filter((p) => p.id && !seen.has(p.id) && (seen.add(p.id), true))
      .sort((a, b) => ms(b) - ms(a));
    return {
      posts: own.filter((p) => p.mediaType !== 'video'),
      reels: own.filter((p) => p.mediaType === 'video'),
      reposts: mine.filter((p) => !!p.repostOfId),
      mentions,
    } as Record<TabKey, Post[]>;
  }, [mine, tagged]);

  const open = (p: Post) => {
    if (!p.id) return;
    // أي فيديو (في أي تبويب) يُفتح مباشرة في شاشة الريلز، والصور/النصوص في عارض كبير بنمط انستغرام
    if (p.mediaType === 'video' && p.mediaUrl) navigate(`/reels/${p.id}`);
    else setViewer({ id: p.id });
  };

  const patchPost = (id: string, patch: Partial<Post>) => {
    const apply = (list: Post[]) => list.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setMine(apply);
    setTagged(apply);
  };
  const removePost = (id: string) => {
    const drop = (list: Post[]) => list.filter((x) => x.id !== id);
    setMine(drop);
    setTagged(drop);
  };

  const items = lists[active];

  return (
    <div className="-mx-4 border-y border-white/10">
      <div className="grid grid-cols-4 border-b border-white/10" role="tablist">
        {TABS.map(({ key, icon: Icon }) => {
          const on = active === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(key)}
              className={`flex flex-col items-center gap-1 py-3 border-b-2 transition-colors ${
                on ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold">{t(`ui.tab.${key}`)}</span>
            </button>
          );
        })}
      </div>

      {!canView ? (
        <div className="py-12 px-6 text-center space-y-2">
          <Lock className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-xs text-slate-400">{t('ui.privateAccount')}</p>
        </div>
      ) : loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      ) : error ? (
        <p className="py-10 text-center text-xs text-red-400">{t('ui.loadFail')}</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-xs text-slate-500">{t(`ui.empty.${active}`)}</p>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {items.map((p) => (
            <Tile key={p.id} post={p} tall={active === 'reels'} onOpen={() => open(p)} />
          ))}
        </div>
      )}

      {viewer && (
        <ProfilePostsViewer
          posts={items}
          startId={viewer.id}
          title={t(`ui.tab.${active}`)}
          onClose={() => setViewer(null)}
          onDeleted={removePost}
          onPatch={patchPost}
        />
      )}
    </div>
  );
};

export default ProfileTabs;
