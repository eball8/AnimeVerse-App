import React, { useEffect, useState } from 'react';
import { Search as SearchIcon, Loader2, X } from 'lucide-react';
import { searchAnime } from '../services/animeService';
import type { Anime } from '../services/animeService';
import AnimeCard from '../components/AnimeCard';

const Search: React.FC = () => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchAnime(q)
        .then((data) => {
          if (!cancelled) {
            setResults(data);
            setHasSearched(true);
          }
        })
        .catch((e) => console.error(e))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <SearchIcon className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">بحث</h2>
      </div>

      <div className="relative">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="ابحث عن أنمي..."
          className="w-full pr-10 pl-10 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
        />
        {term && (
          <button
            onClick={() => setTerm('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <p className="text-center text-xs text-slate-500 py-10">لا توجد نتائج مطابقة.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {results.map((anime) => (
            <AnimeCard key={anime.mal_id} anime={anime} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Search;
