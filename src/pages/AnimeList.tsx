import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { Anime } from '../services/animeService';
import { getTopAnime, getSeasonNow } from '../services/animeService';
import { listCustomAnime } from '../services/customAnimeService';
import AnimeCard from '../components/AnimeCard';

const TITLES: Record<string, string> = {
  top: 'الأكثر رواجاً',
  season: 'يُعرض حالياً',
  custom: 'حصرياً على AnimeVerse',
};

const STEP = 20;
const MAX = 50;

const AnimeList: React.FC = () => {
  const { kind = 'top' } = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(STEP);
  const [items, setItems] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLimit(STEP);
    setItems([]);
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const request: Promise<Anime[]> =
      kind === 'season'
        ? getSeasonNow(limit)
        : kind === 'custom'
        ? listCustomAnime(60)
        : getTopAnime(1, limit);

    request
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, limit]);

  const canLoadMore = kind !== 'custom' && !loading && items.length >= limit && limit < MAX;

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white"
          aria-label="رجوع"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-black text-white">{TITLES[kind] || 'الأنمي'}</h2>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((anime) => (
            <AnimeCard key={String(anime.mal_id)} anime={anime} />
          ))}
        </div>
      )}

      {loading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      )}

      {!loading && error && items.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-10">تعذّر تحميل القائمة. حاول لاحقاً.</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-10">لا توجد أنميات هنا بعد.</p>
      )}

      {canLoadMore && (
        <button
          onClick={() => setLimit((l) => Math.min(l + STEP, MAX))}
          className="w-full btn-primary py-3 text-sm font-bold"
        >
          عرض المزيد
        </button>
      )}
    </div>
  );
};

export default AnimeList;
