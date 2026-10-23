import React from 'react';
import { createPortal } from 'react-dom';
import { Ban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useAccountStatus } from '../hooks/useAccountStatus';
import AppealForm from './AppealForm';

// شاشة «تم تعطيل حسابك» مع نموذج الطعن. تظهر فوق كل شيء عند إغلاق الحساب.
const AccountClosedGate: React.FC = () => {
  const { user, signOut } = useAuth();
  const { t, dir } = useI18n();
  const status = useAccountStatus(user?.uid);

  if (!user || status?.level !== 'closed') return null;

  return createPortal(
    <div className="fixed inset-0 z-[700] bg-dark-950 overflow-y-auto" dir={dir}>
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 gap-5 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <Ban className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white">{t('as.closed.title')}</h2>
          <p className="text-sm text-slate-400 mt-3 leading-relaxed">{t('as.closed.desc')}</p>
        </div>

        <div className="w-full">
          <AppealForm uid={user.uid} level="closed" deadline={status.appealUntil} />
        </div>

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold"
        >
          {t('profile.logout')}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default AccountClosedGate;
