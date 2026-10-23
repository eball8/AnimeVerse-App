import React, { useEffect, useState } from 'react';
import { Compass, Loader2, ArrowRight, Radio, CheckCircle2, Clapperboard } from 'lucide-react';
import { getGenres, getAnimeByGenre, getAnimeBySection } from '../services/animeService';
import type { Anime, ExploreSection } from '../services/animeService';
import AnimeCard from '../components/AnimeCard';
import AnimeSearchBar from '../components/AnimeSearchBar';
import { useI18n } from '../i18n/I18nContext';

const PAGE_SIZE = 24;

const SECTIONS: Array<{ key: ExploreSection; labelKey: string; icon: React.ElementType }> = [
  { key: 'airing', labelKey: 'explore.airing', icon: Radio },
  { key: 'finished', labelKey: 'explore.finished', icon: CheckCircle2 },
  { key: 'movies', labelKey: 'explore.movies', icon: Clapperboard },
];

type View = { kind: 'genre'; id: number } | { kind: 'section'; key: ExploreSection } | null;

const Explore: React.FC = () => {
  const { t } = useI18n();
  const [genres, setGenres] = useState<Array<{ mal_id: number; name: string }>>([]);
  const [view, setView] = useState<View>(null);
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [loadingAnime, setLoadingAnime] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getGenres()
      .then((data: Array<{ mal_id: number; name: string }>) => setGenres(data))
      .catch((e: any) => console.error(e))
      .finally(() => setLoadingGenres(false));
  }, []);

  // عند تغيير القسم/التصنيف نبدأ من الصفحة الأولى
  useEffect(() => {
    setAnimeList([]);
    setPage(1);
    setHasMore(false);
    setError(false);
  }, [view]);

  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    setLoadingAnime(true);
    setError(false);

    const request: Promise<Anime[]> =
      view.kind === 'section'
        ? getAnimeBySection(view.key, page, PAGE_SIZE)
        : getAnimeByGenre(view.id, PAGE_SIZE);

    request
      .then((data: Anime[]) => {
        if (cancelled) return;
        setAnimeList((prev) => {
          const seen = new Set(prev.map((a) => String(a.mal_id)));
          return [...prev, ...data.filter((a) => !seen.has(String(a.mal_id)))];
        });
        // الأقسام تدعم "عرض المزيد"، والتصنيفات صفحة واحدة كما كانت
        setHasMore(view.kind === 'section' && data.length >= PAGE_SIZE);
      })
      .catch((e: any) => {
        console.error(e);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingAnime(false);
      });

    return () => { cancelled = true; };
  }, [view, page]);

  if (loadingGenres) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const currentTitle = !view
    ? ''
    : view.kind === 'section'
    ? t(SECTIONS.find((s) => s.key === view.key)!.labelKey)
    : genres.find((g) => g.mal_id === view.id)?.name;

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Compass className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">{t('explore.title')}</h2>
      </div>

      <AnimeSearchBar />

      {!view ? (
        <>
          {/* أقسام: مستمرة / منتهية / أفلام */}
          <div className="grid grid-cols-3 gap-2">
            {SECTIONS.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView({ kind: 'section', key })}
                className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl bg-gradient-to-br from-primary-500/20 via-accent-500/10 to-transparent border border-white/10 text-white text-xs font-black hover:bg-white/10 transition active:scale-95"
              >
                <Icon className="w-6 h-6 text-primary-400" />
                <span className="text-center leading-tight">{t(labelKey)}</span>
              </button>
            ))}
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-3">{t('explore.pick')}</p>
            <div className="grid grid-cols-2 gap-2">
              {genres.map((genre) => (
                <button
                  key={genre.mal_id}
                  onClick={() => setView({ kind: 'genre', id: genre.mal_id })}
                  className="py-3 px-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold text-start hover:bg-white/10 transition active:scale-95"
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setView(null)}
              className="flex items-center gap-1 text-xs text-primary-400 font-bold"
            >
              <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> {t('explore.back')}
            </button>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-300">{currentTitle}</span>
          </div>

          {animeList.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {animeList.map((anime) => (
                <AnimeCard key={String(anime.mal_id)} anime={anime} />
              ))}
            </div>
          )}

          {loadingAnime && (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          )}

          {!loadingAnime && error && animeList.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-10">{t('list.loadFail')}</p>
          )}

          {!loadingAnime && !error && animeList.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-10">{t('list.empty')}</p>
          )}

          {!loadingAnime && hasMore && (
            <button onClick={() => setPage((p) => p + 1)} className="w-full btn-primary py-3 text-sm font-bold">
              {t('common.more')}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default Explore;
