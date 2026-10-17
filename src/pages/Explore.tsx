import React, { useEffect, useState } from 'react';
import { Compass, Loader2, ArrowRight } from 'lucide-react';
import { getGenres, getAnimeByGenre } from '../services/animeService';
import type { Anime } from '../services/animeService';
import AnimeCard from '../components/AnimeCard';

const Explore: React.FC = () => {
  const [genres, setGenres] = useState<Array<{ mal_id: number; name: string }>>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [loadingAnime, setLoadingAnime] = useState(false);

  // جلب التصنيفات عند فتح الصفحة
  useEffect(() => {
    getGenres()
      .then((data) => setGenres(data))
      .catch((e) => console.error(e))
      .finally(() => setLoadingGenres(false));
  }, []);

  // جلب الأنمي عند اختيار تصنيف
  useEffect(() => {
    if (!selectedGenre) return;
    let cancelled = false;
    setLoadingAnime(true);
    getAnimeByGenre(selectedGenre, 24)
      .then((data) => {
        if (!cancelled) setAnimeList(data);
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setLoadingAnime(false);
      });

    return () => { cancelled = true; };
  }, [selectedGenre]);

  if (loadingGenres) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Compass className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">استكشاف</h2>
      </div>

      {!selectedGenre ? (
        <>
          <p className="text-xs text-slate-400 mb-4">اختر تصنيفاً لتصفح الأنمي:</p>
          <div className="grid grid-cols-2 gap-2">
            {genres.map((genre) => (
              <button
                key={genre.mal_id}
                onClick={() => setSelectedGenre(genre.mal_id)}
                className="py-3 px-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold text-right hover:bg-white/10 transition active:scale-95"
              >
                {genre.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => { setSelectedGenre(null); setAnimeList([]); }}
              className="flex items-center gap-1 text-xs text-primary-400 font-bold"
            >
              <ArrowRight className="w-4 h-4" /> رجوع للتصنيفات
            </button>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-300">
              {genres.find((g) => g.mal_id === selectedGenre)?.name}
            </span>
          </div>

          {loadingAnime ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {animeList.map((anime) => (
                <AnimeCard key={anime.mal_id} anime={anime} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Explore;
