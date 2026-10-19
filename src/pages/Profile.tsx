import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, LogIn, UserPlus, Share2, Pencil, Check, X, Link2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  getFollowCounts, subscribeFollowRequests, acceptRequest, rejectRequest,
} from '../services/followService';
import { copyText, profileLink, shareLink } from '../utils/links';
import Avatar from '../components/Avatar';
import InsightsCard from '../components/InsightsCard';
import ProfileTabs from '../components/ProfileTabs';
import type { UserProfile } from '../types';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { t } = useI18n();
  const [counts, setCounts] = useState({ followers: 0, following: 0, posts: 0 });
  const [requests, setRequests] = useState<UserProfile[]>([]);
  const [copied, setCopied] = useState(false);

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
          <h2 className="text-lg font-black text-white">{t('home.subGuest')}</h2>
          <div className="flex gap-2 pt-2">
            <Link
              to="/login"
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              {t('home.login')}
            </Link>
            <Link
              to="/signup"
              className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {t('home.signup')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const link = profileLink(user.uid);

  const flash = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = async () => {
    if (!profile) return;
    const r = await shareLink(link, t('profile.shareText', { name: profile.displayName }));
    if (r === 'copied') flash();
  };

  const handleCopy = async () => {
    if (await copyText(link)) flash();
  };

  const handleAccept = async (followerId: string) => {
    try {
      await acceptRequest(followerId, user.uid);
      setCounts((c) => ({ ...c, followers: c.followers + 1 }));
    } catch (e) {
      console.error(e);
      alert(t('common.error'));
    }
  };

  const handleReject = async (followerId: string) => {
    try {
      await rejectRequest(followerId, user.uid);
    } catch (e) {
      console.error(e);
      alert(t('common.error'));
    }
  };

  const genderLabel =
    profile?.gender === 'male' ? 'ذكر' : profile?.gender === 'female' ? 'أنثى' : '';

  return (
    <div className="px-4 py-4 space-y-4">
      {/* بطاقة الملف الشخصي */}
      <div className="card p-5 text-center">
        <Avatar
          src={profile?.photoURL}
          seed={user.uid}
          name={profile?.displayName}
          className="w-24 h-24 mx-auto rounded-full object-cover ring-4 ring-primary-500/40 mb-3"
        />
        <h2 className="text-xl font-black text-white">{profile?.displayName}</h2>
        <p className="text-sm text-slate-500">
          @{profile?.username}
          {profile?.pronouns ? <span className="text-slate-400"> · {profile.pronouns}</span> : null}
        </p>
        {genderLabel && <p className="text-[11px] text-slate-500 mt-0.5">{genderLabel}</p>}
        {profile?.bio && (
          <p className="text-xs text-slate-400 mt-3 max-w-xs mx-auto whitespace-pre-line">{profile.bio}</p>
        )}

        {/* العدّادات */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/10">
          <div>
            <div className="text-lg font-black text-white">{counts.posts}</div>
            <div className="text-[10px] text-slate-500 font-bold">{t('profile.posts')}</div>
          </div>
          <div>
            <div className="text-lg font-black text-white">{counts.followers}</div>
            <div className="text-[10px] text-slate-500 font-bold">{t('profile.followers')}</div>
          </div>
          <div>
            <div className="text-lg font-black text-white">{counts.following}</div>
            <div className="text-[10px] text-slate-500 font-bold">{t('profile.following')}</div>
          </div>
        </div>

        {/* أزرار */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => navigate('/edit-profile')}
            className="flex-1 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition"
          >
            <Pencil className="w-4 h-4" /> {t('profile.edit')}
          </button>
          <button
            onClick={handleShare}
            className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition"
            aria-label={t('common.share')}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition"
            aria-label={t('common.copyLink')}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* كارت إحصائيات الوصول */}
      <InsightsCard uid={user.uid} />

      {/* طلبات المتابعة */}
      {requests.length > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-black text-white">{t('profile.requests')} ({requests.length})</h3>
          {requests.map((r) => (
            <div key={r.uid} className="flex items-center gap-3">
              <Avatar
                src={r.photoURL}
                seed={r.uid}
                name={r.displayName}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{r.displayName}</p>
                <p className="text-[10px] text-slate-500 truncate">@{r.username}</p>
              </div>
              <button
                onClick={() => handleAccept(r.uid)}
                className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400"
                aria-label="accept"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleReject(r.uid)}
                className="p-2 rounded-xl bg-red-500/20 text-red-400"
                aria-label="reject"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* التبويبات الأربعة: المنشورات / الريلز / إعادة النشر / الإشارات */}
      <ProfileTabs uid={user.uid} />
    </div>
  );
};

export default Profile;
