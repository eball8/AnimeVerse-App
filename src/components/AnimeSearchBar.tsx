import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, Loader2, X, Star } from 'lucide-react';
import { searchAnime } from '../services/animeService';
import type { Anime } from '../services/animeService';
import { useI18n } from '../i18n/I18nContext';

const MAX_RESULTS = 6;

const AnimeSearchBar: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchAnime(q, MAX_RESULTS)
        .then((data) => {
          if (!cancelled) {
            setResults(data);
            setSearched(true);
          }
        })
        .catch((e) => console.error(e))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('animeSearch.placeholder')}
          className="w-full ps-10 pe-10 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm placeholder:text-slate-500 outline-none focus:border-primary-500/50"
        />
        {loading ? (
          <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary-500" />
        ) : (
          term && (
            <button onClick={() => setTerm('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )
        )}
      </div>

      {!loading && searched && results.length === 0 && (
        <p className="text-center text-xs text-slate-500 py-3">{t('common.noResults')}</p>
      )}

      {results.length > 0 && (
        <div className="card divide-y divide-white/5">
          {results.map((a) => (
            <button
              key={String(a.mal_id)}
              onClick={() => navigate(`/anime/${a.mal_id}`)}
              className="w-full flex items-center gap-3 p-2.5 text-start hover:bg-white/5"
            >
              <img
                src={a.images?.jpg?.image_url}
                alt=""
                loading="lazy"
                className="w-10 h-14 rounded-lg object-cover bg-dark-950 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white line-clamp-1">{a.title_english || a.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {[a.type, a.year].filter(Boolean).join(' • ')}
                </p>
              </div>
              {a.score && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-400">
                  <Star className="w-3 h-3 fill-yellow-400" /> {a.score}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnimeSearchBar;
