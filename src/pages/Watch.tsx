import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Play, Star, AlertCircle, Server } from 'lucide-react';

const Watch: React.FC = () => {
  const { animeId, episodeNumber } = useParams<{ animeId: string, episodeNumber: string }>();
  const navigate = useNavigate();

  // حالة وهمية للتقييم
  const [rating, setRating] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);

  // بيانات وهمية للسيرفرات (لاحقاً ستأتي من Firebase)
  const servers = [
    { id: 1, name: 'سيرفر MF', quality: '1080p', link: '#' },
    { id: 2, name: 'سيرفر ST', quality: '720p', link: '#' },
    { id: 3, name: 'سيرفر VNO', quality: '480p', link: '#' },
    { id: 4, name: 'سيرفر احتياطي', quality: 'Backup', link: '#' },
  ];

  const handleRate = (value: number) => {
    setRating(value);
  };

  const submitRating = () => {
    if (rating > 0) {
      setHasVoted(true);
      // هنا سيتم حفظ التقييم في Firebase لاحقاً
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-dark-950/90 backdrop-blur-md px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-slate-300">
          <ArrowRight className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-sm font-black text-white">مشاهدة الأنمي</h1>
          <p className="text-[10px] text-slate-400">الحلقة {episodeNumber}</p>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Player Area (Mock) */}
        <div className="w-full aspect-video bg-black rounded-2xl flex flex-col items-center justify-center border border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-dark-950/80 to-transparent" />
          <Play className="w-12 h-12 text-white/50 mb-2" />
          <p className="text-xs text-slate-400">سيتم فتح المشغل الخارجي (EZV Player) هنا</p>
        </div>

        {/* Servers Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-5 h-5 text-primary-400" />
            <h3 className="text-sm font-black text-white">السيرفرات المتاحة</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {servers.map((server) => (
              <button
                key={server.id}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition active:scale-95"
              >
                <span className="text-xs font-bold text-white mb-1">{server.name}</span>
                <span className="text-[10px] text-slate-400">{server.quality}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Rating Section */}
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" /> قيّم هذه الحلقة
            </h3>
            <span className="text-xs text-slate-400">8.99/10 من 576 شخص</span>
          </div>

          {!hasVoted ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400">0</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={rating || 5}
                  onChange={(e) => handleRate(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
                <span className="text-xs font-bold text-slate-400">10</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary-400">{rating || 5} / 10</span>
                <button
                  onClick={submitRating}
                  className="btn-primary px-4 py-2 text-xs"
                >
                  إرسال التقييم
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4" />
              شكراً لتقييمك! لقد سجلت {rating} نجوم.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Watch;
