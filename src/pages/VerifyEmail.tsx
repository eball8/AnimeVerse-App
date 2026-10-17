import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut, resendVerification } = useAuth();
  const [checking, setChecking] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');

  // إذا الحساب مفعّل → رجعه للرئيسية
  useEffect(() => {
    if (user?.emailVerified) {
      navigate('/');
    }
  }, [user, navigate]);

  // cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleCheck = async () => {
    setChecking(true);
    setError('');
    try {
      await user?.reload();
      if (user?.emailVerified) {
        navigate('/');
      } else {
        setError('لم يتم تأكيد البريد بعد. تحقق من بريدك الوارد.');
      }
    } catch {
      setError('فشل التحقق، حاول مرة أخرى.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    try {
      await resendVerification();
      setResent(true);
      setCooldown(60);
    } catch {
      setError('فشل إرسال الرابط، حاول لاحقاً.');
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Icon */}
        <div className="text-center">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-primary-500/20 to-accent-500/20 border border-primary-500/30 flex items-center justify-center mb-4">
            <Mail className="w-10 h-10 text-primary-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">افتح بريدك الإلكتروني</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            أرسلنا رابط تأكيد إلى:
          </p>
          <p dir="ltr" className="text-sm font-bold text-primary-400 mt-1">
            {user?.email || 'بريدك'}
          </p>
        </div>

        {/* Info Card */}
        <div className="card p-5 space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed text-center">
            اضغط على الرابط في الرسالة لتأكيد حسابك، ثم ارجع هنا واضغط <b className="text-white">"تحققت من بريدي"</b>.
          </p>
          <p className="text-[10px] text-slate-500 text-center">
            لم تجد الرسالة؟ تحقق من مجلد <b>الرسائل غير المرغوبة (Spam)</b>.
          </p>

          {resent && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-300">تم إرسال الرابط مرة أخرى.</p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {checking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                تحققت من بريدي
              </>
            )}
          </button>

          <button
            onClick={handleResend}
            disabled={cooldown > 0}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {cooldown > 0 ? (
              `إعادة الإرسال بعد ${cooldown} ث`
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                إعادة إرسال الرابط
              </>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-2xl text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-white transition"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
