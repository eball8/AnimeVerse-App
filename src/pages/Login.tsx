import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { signInEmail, signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInEmail(email, password);
      const u = (await import('../config/firebase')).auth.currentUser;
      if (u && !u.emailVerified && u.providerData[0]?.providerId === 'password') {
        navigate('/verify-email');
        return;
      }
      navigate('/');
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
        setError('البريد أو كلمة السر غير صحيحة.');
      } else if (e.code === 'auth/user-not-found') {
        setError('لا يوجد حساب بهذا البريد.');
      } else if (e.code === 'auth/too-many-requests') {
        setError('محاولات كثيرة. جرب لاحقاً.');
      } else {
        setError('حدث خطأ، حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInGoogle();
      navigate('/');
    } catch {
      setError('فشل تسجيل الدخول بـ Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-black bg-gradient-to-r from-primary-400 via-accent-400 to-primary-400 bg-clip-text text-transparent mb-2">
            AnimeVerse
          </h1>
          <p className="text-sm text-slate-400">سجّل دخولك للمتابعة</p>
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

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">كلمة السر</label>
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
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تسجيل الدخول'}
          </button>

          <div className="text-center">
            <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-primary-400 font-bold">
              نسيت كلمة السر؟
            </Link>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-dark-900 text-slate-500">أو</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center gap-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 4.1 29.3 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.2-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 7.1 29.3 5 24 5 16 5 9.1 9.5 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 34.1 26.8 35 24 35c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.2 38.4 16 43 24 43z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41 35.5 45 30.3 45 24c0-1.2-.1-2.3-.4-3.5z"/>
            </svg>
            الدخول بحساب Google
          </button>

          <p className="text-center text-xs text-slate-400 mt-4">
            ما عندك حساب؟{' '}
            <Link to="/signup" className="text-primary-400 font-bold hover:underline">
              أنشئ حساب جديد
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
