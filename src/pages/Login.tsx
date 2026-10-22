import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, X, ChevronLeft, UserPlus, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../config/firebase';
import { getSavedAccounts, removeSavedAccount, saveAccount } from '../utils/savedAccounts';
import type { SavedAccount } from '../utils/savedAccounts';
import { useI18n } from '../i18n/I18nContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, loading: authLoading, signInEmail, signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SavedAccount[]>(getSavedAccounts());
  const [showForm, setShowForm] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  // مثل فيسبوك: إن وُجدت حسابات محفوظة نعرضها أولاً، والنموذج يظهر عند اختيار «استخدام حساب آخر»
  const showPicker = saved.length > 0 && !showForm;

  // إذا كان المستخدم مسجّلاً أصلاً لا نعرض له شاشة الدخول
  useEffect(() => {
    if (authLoading || !user) return;
    const needsVerify = !user.emailVerified && user.providerData[0]?.providerId === 'password';
    if (!needsVerify) navigate('/', { replace: true });
  }, [user, authLoading, navigate]);

  const pickAccount = (acc: SavedAccount) => {
    if (acc.provider === 'google') {
      // إن لم يكن البريد محفوظاً، سيظهر اختيار الحساب مرة واحدة فقط ثم يُحفظ البريد تلقائياً
      handleGoogle(acc.email || undefined, acc.uid);
    } else {
      setEmail(acc.email);
      setPassword('');
      setShowForm(true);
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  };

  const removeAccount = (uid: string) => {
    removeSavedAccount(uid);
    setSaved(getSavedAccounts());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInEmail(email, password);
      
      // التحقق مما إذا كان البريد الإلكتروني قد تم تفعيله
      const u = auth.currentUser;
      if (u && !u.emailVerified && u.providerData[0]?.providerId === 'password') {
        navigate('/verify-email');
        return;
      }
      navigate('/');
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
        setError(t('auth.errInvalid'));
      } else if (e.code === 'auth/user-not-found') {
        setError(t('auth.errNotFound'));
      } else if (e.code === 'auth/too-many-requests') {
        setError(t('auth.errTooMany'));
      } else {
        setError(t('auth.errLogin'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (hintEmail?: string, staleUid?: string) => {
    setError('');
    setLoading(true);
    try {
      const signedEmail = await signInGoogle(hintEmail);

      // نحفظ الحساب الذي دخلنا به فوراً مع بريده، حتى يصبح الدخول به مباشراً في المرة القادمة
      const u = auth.currentUser;
      if (u) {
        const mail =
          signedEmail ||
          u.email ||
          u.providerData.find((x) => !!x?.email)?.email ||
          getSavedAccounts().find((a) => a.uid === u.uid)?.email ||
          '';
        if (mail) {
          saveAccount({
            uid: u.uid,
            email: mail,
            displayName: u.displayName || mail.split('@')[0],
            photoURL: u.photoURL || undefined,
            provider: 'google',
          });
        }
        // إزالة المدخل القديم الذي لا بريد له إذا كان الحساب الفعلي مختلفاً عنه (حتى لا يتكرر في القائمة)
        if (staleUid && staleUid !== u.uid) removeSavedAccount(staleUid);
        setSaved(getSavedAccounts());
      }
      // ملاحظة: في الهاتف، سيتم فتح المتصفح الخارجي.
      // التطبيق سيتوقف هنا حتى يعود المستخدم من المتصفح، ثم سيتولى AuthContext إكمال الدخول.
      if (!window.location.href.includes('android')) {
        navigate('/');
      }
    } catch (e: any) {
      if (!e?.cancelled) setError(t('auth.errGoogle'));
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        // هوامش آمنة: تمنع التداخل مع شريط الحالة العلوي وشريط التنقل السفلي
        paddingTop: 'max(2rem, calc(env(safe-area-inset-top) + 1.25rem))',
        paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1.25rem))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-black bg-gradient-to-r from-primary-400 via-accent-400 to-primary-400 bg-clip-text text-transparent mb-2">
            AnimeVerse
          </h1>
          <p className="text-sm text-slate-400">{t('auth.signinSubtitle')}</p>
        </div>

        {showPicker && (
          <div className="space-y-3">
            {error && <p className="text-xs text-red-400 text-center bg-red-500/10 p-2 rounded-lg">{error}</p>}
            {saved.map((acc) => (
              <div key={acc.uid} className="card flex items-center gap-3 p-3">
                <button type="button" onClick={() => pickAccount(acc)} disabled={loading} className="flex-1 flex items-center gap-3 text-right min-w-0 disabled:opacity-60">
                  <img
                    src={acc.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${acc.uid}`}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-primary-500/40 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white truncate">{acc.displayName}</span>
                    <span className="block text-[11px] text-slate-400 truncate" dir="ltr">{acc.email}</span>
                  </span>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <ChevronLeft className="w-4 h-4 text-slate-500" />}
                </button>
                <button type="button" onClick={() => removeAccount(acc.uid)} className="p-2 text-slate-500 hover:text-white" aria-label={t('auth.remove')}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => { setError(''); setShowForm(true); }}
              className="w-full py-3.5 rounded-full bg-white/10 hover:bg-white/15 transition flex items-center justify-center gap-2 text-sm font-bold text-white"
            >
              <UserRound className="w-4 h-4" /> {t('auth.useOther')}
            </button>
            <Link
              to="/signup"
              className="w-full py-3.5 rounded-full border border-primary-500/60 hover:bg-primary-500/10 transition flex items-center justify-center gap-2 text-sm font-bold text-primary-400"
            >
              <UserPlus className="w-4 h-4" /> {t('auth.newAccount')}
            </Link>
          </div>
        )}

        {!showPicker && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.email')}</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                placeholder="you@example.com"
                className="w-full pr-10 pl-3 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">{t('auth.password')}</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
                placeholder="••••••••"
                className="w-full pr-10 pl-10 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 text-center bg-red-500/10 p-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('auth.signIn')}
          </button>

          <div className="text-center">
            <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-primary-400 font-bold">
              {t('auth.forgot')}
            </Link>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-dark-900 text-slate-500">{t('auth.or')}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleGoogle()}
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center gap-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 4.1 29.3 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.2-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 7.1 29.3 5 24 5 16 5 9.1 9.5 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 34.1 26.8 35 24 35c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.2 38.4 16 43 24 43z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41 35.5 45 30.3 45 24c0-1.2-.1-2.3-.4-3.5z"/>
            </svg>
            {t('auth.googleSignIn')}
          </button>

          <p className="text-center text-xs text-slate-400 mt-4">
            {t('auth.noAccount')}{' '}
            <Link to="/signup" className="text-primary-400 font-bold hover:underline">
              {t('auth.createAccountLink')}
            </Link>
          </p>

          {saved.length > 0 && (
            <button type="button" onClick={() => setShowForm(false)} className="w-full text-center text-xs text-slate-400 hover:text-white font-bold">
              {t('auth.backToSaved')}
            </button>
          )}
        </form>
        )}
      </div>
    </div>
  );
};

export default Login;
