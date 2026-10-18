import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User, Settings, LogOut, LogIn, UserPlus, Share2, Pencil, Lock, Check, X, Bookmark, Shield,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { updateUserProfile } from '../services/userService';
import {
  getFollowCounts, subscribeFollowRequests, acceptRequest, rejectRequest,
} from '../services/followService';
import type { UserProfile } from '../types';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, loading, refreshProfile, isAdmin } = useAuth();
  const [counts, setCounts] = useState({ followers: 0, following: 0, posts: 0 });
  const [requests, setRequests] = useState<UserProfile[]>([]);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  useEffect(() => {
    if (!user) return;
    getFollowCounts(user.uid).then(setCounts).catch(console.error);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeFollowRequests(user.uid, async (ids) => {
      const list = await Promise.all(
        ids.map(async (id) => {
          const s = await getDoc(doc(db, 'users', id));
          return s.exists() ? ({ uid: id, ...s.data() } as UserProfile) : null;
        })
      );
      setRequests(list.filter(Boolean) as UserProfile[]);
    });
  }, [user]);

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

  const isPrivate = profile?.accountType === 'private';

  const handleShare = async () => {
    if (!profile) return;
    const url = `${window.location.origin}/#/user/${user.uid}`;
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

  const togglePrivacy = async () => {
    if (savingPrivacy) return;
    setSavingPrivacy(true);
    try {
      await updateUserProfile(user.uid, { accountType: isPrivate ? 'public' : 'private' });
      await refreshProfile();
    } catch (e) {
      console.error(e);
      alert('تعذر تغيير نوع الحساب.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleAccept = async (followerId: string) => {
    try {
      await acceptRequest(followerId, user.uid);
      setCounts((c) => ({ ...c, followers: c.followers + 1 }));
    } catch (e) {
      console.error(e);
      alert('تعذر قبول الطلب.');
    }
  };

  const handleReject = async (followerId: string) => {
    try {
      await rejectRequest(followerId, user.uid);
    } catch (e) {
      console.error(e);
      alert('تعذر رفض الطلب.');
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
          src={profile?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`}
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
            <div className="text-lg font-black text-white">{counts.posts}</div>
            <div className="text-[10px] text-slate-500 font-bold">منشور</div>
          </div>
          <div>
            <div className="text-lg font-black text-white">{counts.followers}</div>
            <div className="text-[10px] text-slate-500 font-bold">متابع</div>
          </div>
          <div>
            <div className="text-lg font-black text-white">{counts.following}</div>
            <div className="text-[10px] text-slate-500 font-bold">يتابع</div>
          </div>
        </div>
      </div>

      {/* طلبات المتابعة */}
      {requests.length > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-black text-white">طلبات المتابعة ({requests.length})</h3>
          {requests.map((r) => (
            <div key={r.uid} className="flex items-center gap-3">
              <img
                src={r.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${r.uid}`}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{r.displayName}</p>
                <p className="text-[10px] text-slate-500 truncate">@{r.username}</p>
              </div>
              <button
                onClick={() => handleAccept(r.uid)}
                className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400"
                aria-label="قبول"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleReject(r.uid)}
                className="p-2 rounded-xl bg-red-500/20 text-red-400"
                aria-label="رفض"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Menu */}
      <div className="card divide-y divide-white/5">
        <button
          onClick={() => navigate('/library')}
          className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right"
        >
          <Bookmark className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-bold text-white">مكتبتي</span>
        </button>
        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right"
          >
            <Shield className="w-5 h-5 text-primary-400" />
            <span className="text-sm font-bold text-white">لوحة الأدمن</span>
          </button>
        )}
        <button
          onClick={() => navigate('/edit-profile')}
          className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right"
        >
          <Pencil className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-bold text-white">تعديل الملف الشخصي</span>
        </button>
        <button
          onClick={togglePrivacy}
          disabled={savingPrivacy}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition text-right disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-primary-400" />
            <span className="text-sm font-bold text-white">حساب خاص</span>
          </div>
          <span className={`text-xs font-bold ${isPrivate ? 'text-emerald-400' : 'text-slate-500'}`}>
            {isPrivate ? 'مفعّل' : 'متوقف'}
          </span>
        </button>
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
