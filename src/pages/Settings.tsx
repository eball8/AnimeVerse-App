import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Lock,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<'menu' | 'add-password' | 'change-password' | 'change-email'>('menu');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!user) {
    navigate('/login');
    return null;
  }

  const hasPassword = user.providerData.some((p) => p.providerId === 'password');

  const clearState = () => {
    setPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setNewEmail('');
    setMessage('');
    setError('');
    setShowPassword(false);
  };

  const goMenu = () => {
    clearState();
    setMode('menu');
  };

  // إضافة كلمة سر لحساب Google
  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 6) {
      setError('كلمة السر يجب أن تكون 6 أحرف على الأقل.');
      return;
    }
    if (!user.email) {
      setError('لا يوجد بريد مرتبط بالحساب.');
      return;
    }
    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await linkWithCredential(user, credential);
      setMessage('تم إضافة كلمة السر بنجاح!');
      setTimeout(goMenu, 2500);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/provider-already-linked') {
        setError('الحساب مرتبط بكلمة سر مسبقاً.');
      } else if (e.code === 'auth/email-already-in-use') {
        setError('البريد مستخدم بحساب آخر.');
      } else {
        setError('حدث خطأ، حاول مرة أخرى.');
      }
    } finally {
      setBusy(false);
    }
  };

  // تغيير كلمة السر
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 6) {
      setError('كلمة السر الجديدة قصيرة جداً.');
      return;
    }
    setBusy(true);
    try {
      if (!user.email) throw new Error('no-email');
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setMessage('تم تغيير كلمة السر بنجاح!');
      setTimeout(goMenu, 2500);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError('كلمة السر الحالية غير صحيحة.');
      } else {
        setError('حدث خطأ، حاول مرة أخرى.');
      }
    } finally {
      setBusy(false);
    }
  };

  // تغيير البريد — بإرسال رابط تأكيد للبريد الجديد
  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!newEmail.includes('@')) {
      setError('بريد غير صالح.');
      return;
    }
    if (newEmail === user.email) {
      setError('هذا بريدك الحالي.');
      return;
    }
    setBusy(true);
    try {
      if (!user.email) throw new Error('no-email');
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await verifyBeforeUpdateEmail(user, newEmail);
      setMessage(
        `أرسلنا رابط تأكيد إلى ${newEmail}. افتح البريد واضغط الرابط لتأكيد التغيير.`
      );
      setTimeout(goMenu, 5000);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError('كلمة السر غير صحيحة.');
      } else if (e.code === 'auth/email-already-in-use') {
        setError('البريد مستخدم بحساب آخر.');
      } else if (e.code === 'auth/requires-recent-login') {
        setError('يجب إعادة تسجيل الدخول أولاً.');
      } else if (e.code === 'auth/invalid-email') {
        setError('البريد غير صالح.');
      } else {
        setError('حدث خطأ، حاول مرة أخرى.');
      }
    } finally {
      setBusy(false);
    }
  };

  // ---------- Menu ----------
  if (mode === 'menu') {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => navigate('/profile')}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-300"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-black text-white">إعدادات الحساب</h2>
        </div>

        <div className="card divide-y divide-white/5">
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Mail className="w-3 h-3" />
              <span>البريد الحالي</span>
            </div>
            <div dir="ltr" className="text-sm font-bold text-white break-all">
              {user.email}
            </div>
          </div>

          {!hasPassword ? (
            <button
              onClick={() => setMode('add-password')}
              className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right"
            >
              <Lock className="w-5 h-5 text-primary-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">إضافة كلمة سر</div>
                <div className="text-[10px] text-slate-500">
                  تسمح لك بالدخول بالبريد + كلمة السر
                </div>
              </div>
            </button>
          ) : (
            <>
              <button
                onClick={() => setMode('change-password')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right"
              >
                <Lock className="w-5 h-5 text-primary-400 shrink-0" />
                <span className="text-sm font-bold text-white">تغيير كلمة السر</span>
              </button>
              <button
                onClick={() => setMode('change-email')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition text-right"
              >
                <Mail className="w-5 h-5 text-primary-400 shrink-0" />
                <span className="text-sm font-bold text-white">تغيير البريد الإلكتروني</span>
              </button>
            </>
          )}
        </div>

        {profile && (
          <p className="text-[10px] text-slate-500 text-center px-4 leading-relaxed">
            💡 بعض التعديلات تحتاج تأكيد عبر البريد. لأمان حسابك، سنطلب كلمة السر.
          </p>
        )}
      </div>
    );
  }

  // ---------- Forms ----------
  const renderForm = () => {
    if (mode === 'add-password') {
      return (
        <form onSubmit={handleAddPassword} className="card p-6 space-y-4">
          <div>
            <h3 className="text-lg font-black text-white mb-1">إضافة كلمة سر</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              أضف كلمة سر حتى تتمكن من الدخول بالبريد أو بـ Google.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">كلمة السر الجديدة</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
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

          {error && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 leading-relaxed">{error}</p>
            </div>
          )}
          {message && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-300 leading-relaxed">{message}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={goMenu}
              className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
            </button>
          </div>
        </form>
      );
    }

    if (mode === 'change-password') {
      return (
        <form onSubmit={handleChangePassword} className="card p-6 space-y-4">
          <h3 className="text-lg font-black text-white">تغيير كلمة السر</h3>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">كلمة السر الحالية</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              dir="ltr"
              className="w-full px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">كلمة السر الجديدة</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              dir="ltr"
              className="w-full px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
            />
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          {message && <p className="text-xs text-emerald-400 text-center">{message}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={goMenu}
              className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تغيير'}
            </button>
          </div>
        </form>
      );
    }

    // change-email
    return (
      <form onSubmit={handleChangeEmail} className="card p-6 space-y-4">
        <div>
          <h3 className="text-lg font-black text-white mb-1">تغيير البريد الإلكتروني</h3>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            لأمان حسابك، سنرسل رابط تأكيد إلى البريد الجديد. لن يتغيّر بريدك حتى تضغط على الرابط.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">البريد الجديد</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            dir="ltr"
            placeholder="new@example.com"
            className="w-full px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">كلمة السر الحالية</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            dir="ltr"
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
          />
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed">{error}</p>
          </div>
        )}
        {message && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-300 leading-relaxed">{message}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={goMenu}
            className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إرسال الرابط'}
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={goMenu}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-300"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-black text-white">إعدادات الحساب</h2>
      </div>
      {renderForm()}
    </div>
  );
};

export default Settings;
