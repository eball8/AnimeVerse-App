import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Star, Calendar, Tv, PlayCircle, Loader2 } from 'lucide-react';
import { getAnimeById } from '../services/animeService';
import type { Anime } from '../services/animeService';

const AnimeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getAnimeById(Number(id))
      .then((data) => setAnime(data))
      .catch(() => setError('فشل تحميل تفاصيل الأنمي.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center py-24 bg-dark-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-dark-950">
        <p className="text-slate-400 mb-4">{error || 'الأنمي غير موجود.'}</p>
        <button onClick={() => navigate(-1)} className="btn-primary px-6 py-2">
          رجوع
        </button>
      </div>
    );
  }

  // استخدام رابط الصورة المتوافق مع AniList
  const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;

  return (
    <div className="min-h-screen bg-dark-950 pb-10">
      <div className="relative h-[40vh] w-full">
        <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/60 to-transparent z-10" />
        <img
          src={imageUrl}
          alt={anime.title}
          className="w-full h-full object-cover"
        />
        
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 relative z-20 -mt-20 space-y-6">
        <div className="flex items-end gap-4">
          <img
            src={imageUrl}
            alt={anime.title}
            className="w-28 h-40 rounded-2xl object-cover border-2 border-white/10 shadow-2xl bg-dark-900"
          />
          <div className="flex-1 pb-2">
            <h1 className="text-2xl font-black text-white leading-tight mb-1">
              {anime.title_english || anime.title}
            </h1>
            {anime.title_japanese && (
              <p className="text-xs text-slate-400 mb-2">{anime.title_japanese}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              {anime.score && (
                <span className="flex items-center gap-1 text-yellow-400 font-bold">
                  <Star className="w-4 h-4 fill-yellow-400" /> {anime.score}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Tv className="w-4 h-4" /> {anime.type || 'غير معروف'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> {anime.year || 'غير معروف'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {anime.genres.map((g) => (
            <span
              key={g.mal_id}
              className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300"
            >
              {g.name}
            </span>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-black text-white mb-2">القصة</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {anime.synopsis || 'لا يوجد وصف متاح لهذا الأنمي.'}
          </p>
        </div>

        {anime.trailer?.url && (
          <a
            href={anime.trailer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/30 transition"
          >
            <PlayCircle className="w-5 h-5" />
            مشاهدة التريلر
          </a>
        )}

        <div className="pt-4 border-t border-white/10">
          <h3 className="text-sm font-black text-white mb-3">الحلقات والروابط</h3>
          <div className="card p-4 text-center">
            <p className="text-xs text-slate-500">
              سيتم إضافة روابط الحلقات (1080p, 720p, 480p) قريباً من قبل الإدارة.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimeDetail;
