import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Anime } from '../services/animeService';

interface Props {
  anime: Anime;
}

const AnimeCard: React.FC<Props> = ({ anime }) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/anime/${anime.mal_id}`)}
      className="text-right group flex flex-col gap-2 active:scale-95 transition-transform"
    >
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-dark-900 border border-white/5">
        <img
          src={anime.images.webp?.large_image_url || anime.images.jpg.large_image_url}
          alt={anime.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        
        {anime.score && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm flex items-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-[10px] font-bold text-white">{anime.score}</span>
          </div>
        )}
        
        {anime.airing && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-emerald-500/90 backdrop-blur-sm">
            <span className="text-[10px] font-bold text-white">يعرض حالياً</span>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-white line-clamp-2 leading-tight group-hover:text-primary-400 transition-colors">
          {anime.title_english || anime.title}
        </h3>
        <p className="text-[10px] text-slate-500 mt-1">
          {anime.type} • {anime.episodes ? `${anime.episodes} حلقة` : 'غير معروف'}
        </p>
      </div>
    </button>
  );
};

export default AnimeCard;
