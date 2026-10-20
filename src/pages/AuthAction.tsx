import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useI18n } from '../i18n/I18nContext';

const AuthAction: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'reset-form'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');

  useEffect(() => {
    if (!oobCode) {
      setStatus('error');
      setErrorMessage(t('af.invalidLink'));
      return;
    }

    if (mode === 'resetPassword') {
      // التحقق من أن الرابط صالح ولم ينتهِ
      verifyPasswordResetCode(auth, oobCode)
        .then(() => setStatus('reset-form'))
        .catch(() => {
          setStatus('error');
          setErrorMessage(t('af.resetExpired'));
        });
    } else if (mode === 'verifyEmail' || mode === 'verifyAndChangeEmail' || mode === 'recoverEmail') {
      import('firebase/auth').then(({ applyActionCode }) => {
        applyActionCode(auth, oobCode)
          .then(() => setStatus('success'))
          .catch((e) => {
            setStatus('error');
            setErrorMessage(t('af.verifyFail', { code: e.code || t('af.unknownErr') }));
          });
      });
    } else {
      setStatus('error');
      setErrorMessage(t('af.unknownAction'));
    }
  }, [mode, oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      await confirmPasswordReset(auth, oobCode!, newPassword);
      setStatus('success');
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/weak-password') {
        setErrorMessage(t('af.weakPass'));
      } else if (e.code === 'auth/password-does-not-meet-requirements') {
        setErrorMessage(t('af.passRules'));
      } else if (e.code === 'auth/expired-action-code' || e.code === 'auth/invalid-action-code') {
        setErrorMessage(t('af.codeExpired'));
      } else {
        setErrorMessage(t('af.genericErr', { code: e.code || 'unknown' }));
      }
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto text-primary-400 animate-spin mb-4" />
          <p className="text-sm text-slate-400">{t('af.checking')}</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white">{t('af.success')}</h1>
          <p className="text-sm text-slate-400">
            {mode === 'resetPassword'
              ? t('af.okReset')
              : mode === 'verifyAndChangeEmail'
              ? t('af.okChangeEmail')
              : mode === 'recoverEmail'
              ? t('af.okRecover')
              : t('af.okVerify')}
          </p>
          <Link to="/login" className="inline-block px-8 py-3 btn-primary">
            {t('af.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'reset-form') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <form onSubmit={handleResetPassword} className="w-full max-w-md card p-6 space-y-4">
          <h1 className="text-xl font-black text-white text-center mb-2">{t('af.newPassTitle')}</h1>
          <p className="text-xs text-slate-400 text-center mb-4">{t('af.newPassSub')}</p>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">{t('af.newPassLabel')}</label>
            <div className="relative">
              <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                dir="ltr"
                placeholder="••••••••"
                className="w-full ps-10 pe-10 py-3 rounded-2xl bg-dark-900 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMessage && <p className="text-xs text-red-400 text-center bg-red-500/10 p-2 rounded-lg">{errorMessage}</p>}

          <button type="submit" disabled={busy} className="w-full btn-primary py-3 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('af.savePass')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-black text-white">{t('af.failTitle')}</h1>
        <p className="text-sm text-slate-400">{errorMessage}</p>
        <Link to="/login" className="inline-block px-8 py-3 btn-primary">
          {t('af.backToApp')}
        </Link>
      </div>
    </div>
  );
};

export default AuthAction;
