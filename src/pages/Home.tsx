import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, LogIn, UserPlus, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Anime } from '../services/animeService';
import AnimeCard from '../components/AnimeCard';

// بيانات تجريبية مؤقتة
const MOCK_LATEST: Anime[] = [
  { mal_id: 1, title: "Jujutsu Kaisen", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg" } }, airing: true, type: "TV", score: 8.6, genres: [] },
  { mal_id: 2, title: "Attack on Titan", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/10/47347.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/10/47347.jpg" } }, airing: false, type: "TV", score: 8.5, genres: [] },
  { mal_id: 3, title: "Demon Slayer", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg" } }, airing: true, type: "TV", score: 8.5, genres: [] },
  { mal_id: 4, title: "One Piece", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/6/73245.jpg", large_image_url: "https://cdn.myanimelist.net/images/anime/6/73245.jpg" } }, airing: true, type: "TV", score: 8.7, genres: [] }
];

const Home: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();

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
      <div className="card p-5 bg-gradient-to-br from-primary-500/20 via-accent-500/10 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary-400" />
          <span className="text-[10px] text-emerald-400 font-bold">منصة آمنة</span>
        </div>
        <h2 className="text-xl font-black text-white mb-1">
          {profile ? `أهلاً ${profile.displayName}!` : 'أهلاً بك في AnimeVerse'}
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          {profile ? 'استمتع بمشاهدة أحدث الحلقات.' : 'سجّل دخولك لتجربة كاملة.'}
        </p>
        {!user && (
          <div className="flex gap-2">
            <Link to="/login" className="flex-1 btn-primary py-2 flex items-center justify-center gap-1.5 text-xs">
              <LogIn className="w-3.5 h-3.5" /> دخول
            </Link>
            <Link to="/signup" className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> حساب
            </Link>
          </div>
        )}
      </div>

      {/* Latest Updates Grid */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-accent-400" />
          <h3 className="text-lg font-black text-white">أحدث الحلقات</h3>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {MOCK_LATEST.map((anime, index) => (
            <AnimeCard key={anime.mal_id} anime={anime} episodeNumber={index + 1} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
