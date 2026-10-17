import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Sparkles, TrendingUp, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Anime } from '../services/animeService';
import AnimeCard from '../components/AnimeCard';

// بيانات تجريبية مضمونة 100% (لا تحتاج إنترنت)
const MOCK_ANIME: Anime[] = [
  {
    mal_id: 1, title: "Attack on Titan", title_english: "Attack on Titan",
    synopsis: "Humanity fights for survival against giant humanoid Titans.",
    images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/10/47347.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/10/47347.jpg" } },
    airing: true, type: "TV", episodes: 25, score: 8.5, year: 2013, genres: []
  },
  {
    mal_id: 2, title: "Jujutsu Kaisen", title_english: "Jujutsu Kaisen",
    synopsis: "A boy swallows a cursed talisman and enters the world of sorcery.",
    images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg" } },
    airing: true, type: "TV", episodes: 24, score: 8.6, year: 2020, genres: []
  },
  {
    mal_id: 3, title: "One Piece", title_english: "One Piece",
    synopsis: "A pirate crew searches for the ultimate treasure, the One Piece.",
    images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/6/73245.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/6/73245.jpg" } },
    airing: true, type: "TV", episodes: 1000, score: 8.7, year: 1999, genres: []
  },
  {
    mal_id: 4, title: "Demon Slayer", title_english: "Demon Slayer",
    synopsis: "A young boy becomes a demon slayer to avenge his family.",
    images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg" } },
    airing: true, type: "TV", episodes: 26, score: 8.5, year: 2019, genres: []
  }
];

const Home: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  
  // نستخدم البيانات التجريبية بدلاً من الـ API
  const [topAnime] = useState<Anime[]>(MOCK_ANIME);
  const [seasonAnime] = useState<Anime[]>(MOCK_ANIME);

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
            <Link to="/login" className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2 text-xs">
              <LogIn className="w-4 h-4" /> دخول
            </Link>
            <Link to="/signup" className="flex-1 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-2">
              <UserPlus className="w-4 h-4" /> حساب جديد
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
          <Link to="/explore" className="text-xs text-primary-400 font-bold">عرض الكل</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {topAnime.map((anime) => (
            <AnimeCard key={anime.mal_id} anime={anime} />
          ))}
        </div>
      </section>

      {/* Seasonal Anime */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-400" />
            <h3 className="text-lg font-black text-white">يُعرض حالياً</h3>
          </div>
          <Link to="/explore" className="text-xs text-primary-400 font-bold">عرض الكل</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {seasonAnime.map((anime) => (
            <AnimeCard key={anime.mal_id} anime={anime} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
