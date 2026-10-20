import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../config/firebase';
import { useI18n } from '../i18n/I18nContext';

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, signOut, resendVerification, refreshUser } = useAuth(); 
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setError('');
    try {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          refreshUser();
          navigate('/');
        } else {
          setError(t('af.errNotVerified'));
        }
      }
    } catch {
      setError(t('af.errConn'));
    } finally {
      setChecking(false);
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
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-primary-500/20 to-accent-500/20 border border-primary-500/30 flex items-center justify-center mb-4">
            <Mail className="w-10 h-10 text-primary-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">{t('af.checkMail')}</h1>
          <p className="text-sm text-slate-400 leading-relaxed">{t('af.sentVerifyTo')}</p>
          <p dir="ltr" className="text-sm font-bold text-primary-400 mt-1">{user?.email}</p>
        </div>

        <div className="card p-5 space-y-3 text-center">
          <p className="text-xs text-slate-300 leading-relaxed">
            {t('af.verifyHint')} <b className="text-white">"{t('af.verified')}"</b>
          </p>
          {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error}</p>}
        </div>

        <div className="space-y-3">
          <button onClick={handleCheck} disabled={checking} className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> {t('af.verified')}</>}
          </button>
          
          <button onClick={resendVerification} className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition">
             <RefreshCw className="w-4 h-4" /> {t('af.resend')}
          </button>
          
          <button onClick={async () => { await signOut(); navigate('/login'); }} className="w-full py-3 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-white transition">
            <LogOut className="w-4 h-4" /> {t('af.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
