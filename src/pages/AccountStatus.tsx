import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Ban, CheckCircle2, ChevronRight, Clock, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useAccountStatus, useStatusEvents } from '../hooks/useAccountStatus';
import { LEVEL_UI, REACH, YELLOW_DAYS } from '../services/accountStatusService';
import type { StatusLevel } from '../services/accountStatusService';
import AppealForm from '../components/AppealForm';

const LEVEL_ICON: Record<StatusLevel, React.ElementType> = {
  green: CheckCircle2,
  yellow: AlertTriangle,
  red: ShieldAlert,
  closed: Ban,
};

const EVENT_ICON: Record<string, React.ElementType> = {
  warn: AlertTriangle,
  delete: Trash2,
  restrict: Clock,
  ban: Ban,
};

const AccountStatus: React.FC = () => {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const status = useAccountStatus(user?.uid);
  const events = useStatusEvents(user?.uid);

  if (!user) return null;

  const level: StatusLevel = status?.level ?? 'green';
  const ui = LEVEL_UI[level];
  const Icon = LEVEL_ICON[level];
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang);

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-300"
          aria-label={t('common.back')}
        >
          <ChevronRight className="w-5 h-5 ltr:rotate-180" />
        </button>
        <h2 className="text-xl font-black text-white">{t('as.title')}</h2>
      </div>

      <div className={`card p-6 text-center border ${ui.border}`}>
        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center border ${ui.bg} ${ui.border}`}>
          <Icon className={`w-8 h-8 ${ui.text}`} />
        </div>
        <h3 className={`text-lg font-black mt-4 ${ui.text}`}>{t(`as.${level}.title`)}</h3>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">{t(`as.${level}.desc`)}</p>
        {status && level !== 'closed' && status.until > Date.now() && (
          <p className="text-xs text-slate-400 mt-3">{t('as.until', { date: date(status.until) })}</p>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white">{t('as.reach')}</span>
          <span className={`font-black ${ui.text}`}>{t(`as.reach.${level}`)}</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 mt-3 overflow-hidden">
          <div className={`h-full rounded-full ${ui.dot}`} style={{ width: `${Math.round(REACH[level] * 100)}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3">{t('as.warnings', { n: status?.strikes ?? 0 })}</p>
        <p className="text-[11px] text-slate-500 mt-1">{t('as.rule', { days: YELLOW_DAYS })}</p>
      </div>

      <div className="card divide-y divide-white/5 overflow-hidden">
        <h4 className="text-sm font-black text-white p-4">{t('as.history')}</h4>
        {events.length === 0 ? (
          <p className="text-xs text-slate-500 p-4">{t('as.history.empty')}</p>
        ) : (
          events.map((e) => {
            const EIcon = EVENT_ICON[e.code] || AlertTriangle;
            const danger = e.code === 'restrict' || e.code === 'ban';
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    danger ? 'bg-red-500/15' : 'bg-amber-500/15'
                  }`}
                >
                  <EIcon className={`w-4 h-4 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">{t(`as.ev.${e.code}`)}</p>
                  {e.createdAt > 0 && <p className="text-[10px] text-slate-500 mt-0.5">{date(e.createdAt)}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {level !== 'green' && status && (
        <AppealForm uid={user.uid} level={level} deadline={status.appealUntil} />
      )}
    </div>
  );
};

export default AccountStatus;
