import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Sparkles, TrendingUp, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getTopAnime, getSeasonNow } from '../services/animeService';
import type { Anime } from '../services/animeService';
import AnimeCard from '../components/AnimeCard';

const Home: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  
  const [topAnime, setTopAnime] = useState<Anime[]>([]);
  const [seasonAnime, setSeasonAnime] = useState<Anime[]>([]);
  const [loadingAnime, setLoadingAnime] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingAnime(true);
    
    Promise.all([getTopAnime(1, 10), getSeasonNow(10)])
      .then(([top, season]) => {
        if (!cancelled) {
          setTopAnime(top);
          setSeasonAnime(season);
        }
      })
      .catch((e) => console.error('Failed to fetch anime:', e))
      .finally(() => {
        if (!cancelled) setLoadingAnime(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (authLoading) {
    return (
      <div className="py-24 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Welcome Card */}
      <div className="card p-6 bg-gradient-to-br from-primary-500/20 via-accent-500/10 to-transparent">
        <div className="flex items-center gap-3 mb-3">
          <ShieldCheck className="w-6 h-6 text-primary-400" />
          <span className="text-xs text-emerald-400 font-bold">منصة آمنة</span>
        </div>
        <h2 className="text-2xl font-black text-white mb-2">
          {profile ? `أهلاً ${profile.displayName}!` : 'أهلاً بك في AnimeVerse'}
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          {profile
            ? 'استمتع بمشاهدة الأنمي، اكتشف الجديد، وتواصل مع مجتمعك.'
            : 'سجّل دخولك لتجربة كاملة: مشاهدة الأنمي، المجتمع، والرسائل المشفّرة.'}
        </p>

        {!user && (
          <div className="flex gap-2">
            <Link
              to="/login"
              className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2 text-xs"
            >
              <LogIn className="w-4 h-4" />
              دخول
            </Link>
            <Link
              to="/signup"
              className="flex-1 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              حساب جديد
            </Link>
          </div>
        )}
      </div>

      {/* Trending Anime */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent-400" />
            <h3 className="text-lg font-black text-white">الأكثر رواجاً</h3>
          </div>
          <Link to="/explore" className="text-xs text-primary-400 font-bold">
            عرض الكل
          </Link>
        </div>
        
        {loadingAnime ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {topAnime.map((anime) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>
        )}
      </section>

      {/* Seasonal Anime */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-400" />
            <h3 className="text-lg font-black text-white">يُعرض حالياً</h3>
          </div>
          <Link to="/explore" className="text-xs text-primary-400 font-bold">
            عرض الكل
          </Link>
        </div>
        
        {loadingAnime ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {seasonAnime.map((anime) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
