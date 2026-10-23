import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, Loader2, X, Play } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import { badgeOf } from '../types';
import { searchPosts, searchUsers } from '../services/searchService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import type { Post } from '../services/postService';
import type { UserProfile } from '../types';
import { videoThumb } from '../utils/links';

const Search: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [videos, setVideos] = useState<Post[]>([]);

  const briefs = useUserBriefs([...posts, ...videos].map((p) => p.authorId));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = term.trim();
    if (q.length < 2 || loading) return;
    
    setLoading(true);
    try {
      const [u, p] = await Promise.all([searchUsers(q), searchPosts(q)]);
      setUsers(u);
      setPosts(p.posts);
      setVideos(p.videos);
      setSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const empty = searched && !users.length && !posts.length && !videos.length;

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <SearchIcon className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">{t('search.title')}</h2>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full ps-10 pe-9 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm placeholder:text-slate-500 outline-none focus:border-primary-500/50"
          />
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                setSearched(false);
                setUsers([]);
                setPosts([]);
                setVideos([]);
              }}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button disabled={loading || term.trim().length < 2} className="btn-primary px-4 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('search.button')}
        </button>
      </form>

      {!searched && !loading && <p className="text-xs text-slate-500 leading-relaxed">{t('search.hint')}</p>}
      {empty && <p className="text-center text-xs text-slate-500 py-10">{t('common.noResults')}</p>}

      {users.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-black text-white">{t('search.people')}</h3>
          <div className="card divide-y divide-white/5">
            {users.map((u) => (
              <button
                key={u.uid}
                onClick={() => navigate(`/user/${u.uid}`)}
                className="w-full flex items-center gap-3 p-3 text-start hover:bg-white/5"
              >
                <Avatar src={u.photoURL} seed={u.uid} name={u.displayName} className="w-10 h-10 rounded-full object-cover bg-dark-900" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                    <span className="truncate">{u.displayName}</span>
                    <VerifiedBadge badge={badgeOf(u)} withText />
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">@{u.username}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {posts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-black text-white">{t('search.posts')}</h3>
          <div className="card divide-y divide-white/5">
            {posts.map((p) => {
              const a = pickAuthor(briefs, p.authorId, p.authorName, p.authorPhotoURL);
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/post/${p.id}`)}
                  className="w-full p-3 text-start hover:bg-white/5"
                >
                  <p className="text-xs font-bold text-primary-400">{a.name}</p>
                  <p className="text-sm text-slate-200 line-clamp-2 break-words">{p.content}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-black text-white">{t('search.videos')}</h3>
          <div className="grid grid-cols-3 gap-2">
            {videos.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/reels/${p.id}`)}
                className="relative aspect-[9/16] rounded-xl overflow-hidden bg-dark-900 border border-white/5"
              >
                {videoThumb(p.mediaUrl) && (
                  <img src={videoThumb(p.mediaUrl)} alt="" loading="lazy" className="w-full h-full object-cover" />
                )}
                <Play className="absolute inset-0 m-auto w-7 h-7 text-white/80" />
              </button>
            ))}
          </div>
        </section>
      )}

      {searched && <p className="text-[10px] text-slate-600 text-center">{t('search.note')}</p>}
    </div>
  );
};

export default Search;
