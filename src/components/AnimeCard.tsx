import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Anime } from '../services/animeService';

interface Props {
  anime: Anime;
  episodeNumber?: number;
}

const AnimeCard: React.FC<Props> = ({ anime, episodeNumber }) => {
  const navigate = useNavigate();
  const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;

  return (
    <button
      onClick={() => navigate(`/anime/${anime.mal_id}`)}
      className="text-right group flex flex-col gap-1 active:scale-95 transition-transform"
    >
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-dark-900 border border-white/5">
        <img
          src={imageUrl}
          alt={anime.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        
        {episodeNumber && (
          <div className="absolute bottom-0 left-0 right-0 bg-primary-600/90 backdrop-blur-sm py-1 text-center">
            <span className="text-[10px] font-bold text-white">الحلقة : {episodeNumber}</span>
          </div>
        )}

        {anime.score && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm flex items-center gap-1">
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-[10px] font-bold text-white">{anime.score}</span>
          </div>
        )}
      </div>

      <div className="px-1 mt-1">
        <h3 className="text-xs font-bold text-white line-clamp-1 leading-tight group-hover:text-primary-400 transition-colors">
          {anime.title_english || anime.title}
        </h3>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] text-emerald-400 font-bold">
            {anime.airing ? 'مستمر' : 'مكتمل'}
          </span>
          <span className="text-[9px] text-slate-500">
            {anime.type}
          </span>
        </div>
      </div>
    </button>
  );
};

export default AnimeCard;
