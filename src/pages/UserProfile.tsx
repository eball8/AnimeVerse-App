import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, Lock, UserPlus, UserCheck, Clock, MessageCircle, Share2, Link2, Check } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { UserProfile } from '../types';
import {
  getFollowCounts, getFollowState, followUser, unfollowUser, cancelRequest,
} from '../services/followService';
import type { FollowState } from '../services/followService';
import { notify } from '../services/notificationService';
import { copyText, profileLink } from '../utils/links';
import { usePostsCount } from '../hooks/usePostsCount';
import Avatar from '../components/Avatar';
import ProfileTabs from '../components/ProfileTabs';
import ProfileShareSheet from '../components/ProfileShareSheet';
import { recordProfileView } from '../services/profileInsightsService';
import { markProfileVisited } from '../services/storyService'; // ← أضفنا هذا السطر

const UserProfilePage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [p, setP] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<FollowState>('none');
  const [counts, setCounts] = useState({ followers: 0, following: 0, posts: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const posts = usePostsCount(uid, false);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    if (user && user.uid === uid) {
      navigate('/profile', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists() || (snap.data() as any).isDeactivated === true) {
          if (!cancelled) setP(null);
          return;
        }
        const prof = { uid, ...snap.data() } as UserProfile;
        const c = await getFollowCounts(uid);
        const s: FollowState = user ? await getFollowState(user.uid, uid) : 'none';
        if (!cancelled) {
          setP(prof);
          setCounts(c);
          setState(s);
          
          if (user) {
            // تسجيل الزيارة لإحصائيات صاحب الحساب
            recordProfileView(uid, user.uid);
            // تسجيل زيارة الملف الشخصي لإظهار القصة دائماً بعد الزيارة
            markProfileVisited(uid);
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(t('user.loadFail'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, user, navigate]);

  const handleFollow = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!p || busy) return;
    setBusy(true);
    setError('');
    try {
      if (state === 'following') {
        await unfollowUser(user.uid, p.uid);
        setState('none');
        setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }));
      } else if (state === 'requested') {
        await cancelRequest(user.uid, p.uid);
        setState('none');
      } else {
        const next = await followUser(
          user.uid,
          p.uid,
          p.accountType === 'private' ? 'private' : 'public'
        );
        setState(next);
        if (next === 'following') setCounts((c) => ({ ...c, followers: c.followers + 1 }));
        notify(
          p.uid,
          next === 'following' ? 'follow' : 'request',
          next === 'following' ? 'بدأ بمتابعتك' : 'أرسل لك طلب متابعة'
        );
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.code === 'permission-denied' ? t('user.followError') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const flash = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-400">
        {error || t('user.notFound')}
      </div>
    );
  }

  const isPrivate = p.accountType === 'private';
  const label =
    state === 'following'
      ? t('user.following')
      : state === 'requested'
      ? t('user.requested')
      : isPrivate
      ? t('user.requestFollow')
      : t('user.follow');
  const Icon = state === 'following' ? UserCheck : state === 'requested' ? Clock : UserPlus;
  const link = profileLink(p.uid);

  return (
    <div className="px-4 py-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="p-2 rounded-xl hover:bg-white/10 text-slate-300"
        aria-label={t('common.back')}
      >
        <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
      </button>

      <div className="card p-6 text-center relative">
        <div className="absolute top-3 start-3 flex gap-1">
          <button
            onClick={async () => {
              if (await copyText(link)) flash();
            }}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-400"
            aria-label={t('common.copyLink')}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-400"
            aria-label={t('common.share')}
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        <Avatar
          src={p.photoURL}
          seed={p.uid}
          name={p.displayName}
          className="w-24 h-24 mx-auto rounded-full object-cover ring-4 ring-primary-500/40 mb-3"
        />
        <h2 className="text-xl font-black text-white">{p.displayName}</h2>
        <p className="selectable text-sm text-slate-500">
          @{p.username}
          {p.pronouns ? <span className="text-slate-400"> · {p.pronouns}</span> : null}
        </p>
        {p.bio && <p className="selectable text-xs text-slate-400 mt-3 max-w-xs mx-auto">{p.bio}</p>}

        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/10">
          <div>
            <div className="text-lg font-black text-white tabular-nums" aria-live="polite">
              {posts.loading ? '—' : posts.postsCount}
            </div>
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

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleFollow}
            disabled={busy}
            className={`flex-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50 ${
              state === 'none'
                ? 'btn-primary'
                : 'rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold'
            }`}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Icon className="w-4 h-4" /> {label}
              </>
            )}
          </button>
          <button
            onClick={() => navigate(`/messages/${p.uid}`)}
            className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> {t('user.message')}
          </button>
        </div>

        {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg mt-3">{error}</p>}

        {isPrivate && state !== 'following' && (
          <p className="text-[11px] text-slate-500 mt-3 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" /> {t('user.privateNote')}
          </p>
        )}
      </div>

      <ProfileTabs uid={p.uid} canView={!isPrivate || state === 'following'} />

      {shareOpen && (
        <ProfileShareSheet
          userId={p.uid}
          displayName={p.displayName}
          username={p.username}
          photoURL={p.photoURL}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
};

export default UserProfilePage;
