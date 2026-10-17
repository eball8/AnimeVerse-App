import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Settings,
  LogOut,
  LogIn,
  UserPlus,
  Share2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, loading } = useAuth();

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="card p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center">
            <User className="w-8 h-8 text-primary-400" />
          </div>
          <h2 className="text-lg font-black text-white">ما سجّلت دخولك</h2>
          <p className="text-sm text-slate-400">
            سجّل دخولك لعرض ملفك الشخصي، متابعة الأنمي، والمشاركة في المجتمع.
          </p>
          <div className="flex gap-2 pt-2">
            <Link
              to="/login"
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              تسجيل الدخول
            </Link>
            <Link
              to="/signup"
              className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              حساب جديد
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleShare = async () => {
    if (!profile) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: profile.displayName,
          text: `تابع ${profile.displayName} على AnimeVerse`,
          url,
        });
      } catch {
        /* ignore */
      }
    } else {
      await navigator.clipboard.writeText(url);
      alert('تم نسخ رابط الملف الشخصي');
    }
  };

  return (
    <div className="px-4 py-6 space-y-4">
      {/* Profile Card */}
      <div className="card p-6 text-center relative">
        <button
          onClick={handleShare}
          className="absolute top-3 left-3 p-2 rounded-xl hover:bg-white/10 text-slate-400"
          aria-label="مشاركة"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <img
          src={
            profile?.photoURL ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`
          }
          alt=""
          className="w-24 h-24 mx-auto rounded-full object-cover ring-4 ring-primary-500/40 mb-3"
        />
        <h2 className="text-xl font-black text-white">{profile?.displayName}</h2>
        <p className="text-sm text-slate-500">@{profile?.username}</p>
        {profile?.bio && (
          <p className="text-xs text-slate-400 mt-3 max-w-xs mx-auto">{profile.bio}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/10">
          <div>
            <div className="text-lg font-black text-white">{profile?.postsCount || 0}</div>
            <div className="text-[10px] text-slate-500 font-bold">منشور</div>
          </div>
          <div>
            <div className="text-lg font-black text-white">{profile?.followersCount || 0}</div>
            <div className="text-[10px] text-slate-500 font-bold">متابع</div>
          </div>
          <div>
            <div className="text-lg font-black text-white">{profile?.followingCount || 0}</div>
            <div className="text-[10px] text-slate-500 font-bold">يتابع</div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="card divide-y divide-white/5">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right"
        >
          <Settings className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-bold text-white">إعدادات الحساب</span>
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right text-red-400"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-bold">تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
};

export default Profile;
