import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Loader2, RefreshCw, LogIn } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';

const COOLDOWN_SECONDS = 60;

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (isResend: boolean) => {
    setError('');
    setInfo('');
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
              3) ارجع إلى التطبيق وسجّل الدخول بكلمة السر <b className="text-white">الجديدة</b>.
            </p>
            {info && <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg">{info}</p>}
            {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error}</p>}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> العودة لتسجيل الدخول
            </button>

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
