import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, RefreshCw, LogIn, CheckCircle2 } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { checkEmail } from '../utils/emailValidation';

const COOLDOWN_SECONDS = 60;

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { signInEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (isResend: boolean) => {
    setError('');
    setInfo('');

    const emailCheck = checkEmail(email);
    if (!emailCheck.ok) {
      setError(emailCheck.message);
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
      if (isResend) setInfo('تم إرسال رابط جديد. استخدم آخر رسالة وصلتك فقط.');
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/user-not-found') {
        setError('لا يوجد حساب بهذا البريد.');
      } else if (e.code === 'auth/invalid-email') {
        setError('البريد غير صالح.');
      } else if (e.code === 'auth/too-many-requests') {
        setError('محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.');
      } else {
        setError('حدث خطأ، حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSigningIn(true);
    try {
      await signInEmail(email.trim(), password);
      const u = auth.currentUser;
      if (u && !u.emailVerified && u.providerData[0]?.providerId === 'password') {
        navigate('/verify-email', { replace: true });
        return;
      }
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const c = (err as { code?: string }).code;
      if (c === 'auth/invalid-credential' || c === 'auth/wrong-password') {
        setError('كلمة السر غير صحيحة. تأكد أنك حفظتها في صفحة الرابط، وإن لم تحفظها افتح آخر رابط وصلك.');
      } else if (c === 'auth/too-many-requests') {
        setError('محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.');
      } else {
        setError('تعذر تسجيل الدخول. (' + (c || 'unknown') + ')');
      }
    } finally {
      setSigningIn(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-primary-500/20 to-accent-500/20 border border-primary-500/30 flex items-center justify-center mb-4">
              <Mail className="w-10 h-10 text-primary-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">افتح بريدك الإلكتروني</h1>
            <p className="text-sm text-slate-400 leading-relaxed">أرسلنا رابط تغيير كلمة السر إلى:</p>
            <p dir="ltr" className="text-sm font-bold text-primary-400 mt-1">{email}</p>
          </div>

          <div className="card p-5 space-y-2 text-center">
            <p className="text-xs text-slate-300 leading-relaxed">
              1) افتح الرابط في الرسالة.
              <br />
              2) اكتب كلمة السر الجديدة في الصفحة التي تفتح واضغط حفظ.
              <br />
              3) ارجع إلى هنا واضغط <b className="text-white">"لقد تحققت من بريدي"</b>.
            </p>
            {info && <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg">{info}</p>}
            {error && !confirming && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error}</p>}
          </div>

          {confirming ? (
            <form onSubmit={handleSignIn} className="card p-5 space-y-4">
              <p className="text-xs text-slate-300 text-center">اكتب كلمة السر الجديدة لتدخل مباشرة:</p>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
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
              {error && <p className="text-xs text-red-400 text-center bg-red-500/10 p-2 rounded-lg">{error}</p>}
              <button
                type="submit"
                disabled={signingIn}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" /> دخول</>}
              </button>
            </form>
          ) : (
            <button
              onClick={() => { setError(''); setCooldown(0); setConfirming(true); }}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> لقد تحققت من بريدي
            </button>
          )}

          <div className="space-y-3">
            {!confirming && (
              <button
                onClick={() => send(true)}
                disabled={loading || cooldown > 0}
                className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ث` : 'إعادة إرسال الرابط'}
                  </>
                )}
              </button>
            )}
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="w-full py-2 text-slate-400 text-xs font-bold hover:text-white transition"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-white mb-2">نسيت كلمة السر؟</h1>
          <p className="text-sm text-slate-400">
            أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                placeholder="you@example.com"
                className="w-full pr-10 pl-3 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إرسال رابط الإعادة'}
          </button>

          <p className="text-center text-xs text-slate-400">
            تذكرت كلمة السر؟{' '}
            <Link to="/login" className="text-primary-400 font-bold hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
