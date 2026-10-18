import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, Lock, UserPlus, UserCheck, Clock } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import type { UserProfile } from '../types';
import {
  getFollowCounts, getFollowState, followUser, unfollowUser, cancelRequest,
} from '../services/followService';
import type { FollowState } from '../services/followService';

const UserProfilePage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [p, setP] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<FollowState>('none');
  const [counts, setCounts] = useState({ followers: 0, following: 0, posts: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
        if (!snap.exists()) {
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
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('تعذر تحميل الملف الشخصي.');
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
      }
    } catch (e: any) {
      console.error(e);
      setError(
        e?.code === 'permission-denied'
          ? 'لا يمكنك متابعة هذا الحساب.'
          : 'حدث خطأ، حاول مرة أخرى.'
      );
    } finally {
      setBusy(false);
    }
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
        {error || 'المستخدم غير موجود.'}
      </div>
    );
  }

  const isPrivate = p.accountType === 'private';
  const label =
    state === 'following'
      ? 'تتابعه'
      : state === 'requested'
      ? 'تم إرسال الطلب'
      : isPrivate
      ? 'إرسال طلب متابعة'
      : 'متابعة';
  const Icon = state === 'following' ? UserCheck : state === 'requested' ? Clock : UserPlus;

  return (
    <div className="px-4 py-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="p-2 rounded-xl hover:bg-white/10 text-slate-300"
        aria-label="رجوع"
      >
        <ArrowRight className="w-5 h-5" />
      </button>

      <div className="card p-6 text-center">
        <img
          src={p.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.uid}`}
          alt=""
          className="w-24 h-24 mx-auto rounded-full object-cover ring-4 ring-primary-500/40 mb-3"
        />
        <h2 className="text-xl font-black text-white">{p.displayName}</h2>
        <p className="text-sm text-slate-500">@{p.username}</p>
        {p.bio && <p className="text-xs text-slate-400 mt-3 max-w-xs mx-auto">{p.bio}</p>}

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

        <button
          onClick={handleFollow}
          disabled={busy}
          className={`mt-5 w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 ${
            state === 'none'
              ? 'btn-primary'
              : 'rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold'
          }`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Icon className="w-4 h-4" /> {label}</>}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg mt-3">{error}</p>}

        {isPrivate && state !== 'following' && (
          <p className="text-[11px] text-slate-500 mt-3 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" /> هذا الحساب خاص
          </p>
        )}
      </div>
    </div>
  );
};

export default UserProfilePage;
