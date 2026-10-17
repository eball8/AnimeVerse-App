import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/user-not-found') {
        setError('لا يوجد حساب بهذا البريد.');
      } else if (e.code === 'auth/invalid-email') {
        setError('البريد غير صالح.');
      } else {
        setError('حدث خطأ، حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white">تحقق من بريدك</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            أرسلنا رابط إعادة تعيين كلمة السر إلى:
          </p>
          <p dir="ltr" className="text-sm font-bold text-primary-400">{email}</p>
          <p className="text-xs text-slate-500">
            افتح الرابط في الرسالة لإعادة تعيين كلمة السر.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-primary-400 font-bold hover:underline"
          >
            <ArrowRight className="w-4 h-4" />
            رجوع لتسجيل الدخول
          </Link>
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
