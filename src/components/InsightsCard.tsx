import React, { useEffect, useState } from 'react';
import { Eye, Users, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { getProfileInsights } from '../services/profileInsightsService';
import type { ProfileInsights } from '../services/profileInsightsService';

const Growth: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-500">
        <Minus className="w-3 h-3" /> —
      </span>
    );
  }
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center gap-0.5 text-[11px] font-black ${up ? 'text-emerald-400' : 'text-red-400'}`}
    >
      <Icon className="w-3 h-3" />
      {up ? '+' : ''}
      {value}%
    </span>
  );
};

const Stat: React.FC<{ icon: React.ElementType; label: string; value: number; growth: number | null }> = ({
  icon: Icon,
  label,
  value,
  growth,
}) => (
  <div className="flex-1 min-w-0 p-3 rounded-2xl bg-white/5 border border-white/10">
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
      <Icon className="w-3.5 h-3.5 text-primary-400" />
      <span className="text-[11px] font-bold truncate">{label}</span>
    </div>
    <div className="flex items-end justify-between gap-2">
      <span className="text-xl font-black text-white leading-none">{value.toLocaleString('en-US')}</span>
      <Growth value={growth} />
    </div>
  </div>
);

const InsightsCard: React.FC<{ uid: string }> = ({ uid }) => {
  const { t } = useI18n();
  const [data, setData] = useState<ProfileInsights | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    getProfileInsights(uid)
      .then((r) => !cancelled && setData(r))
      .catch((e) => {
        console.error('insights failed:', e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const zero: ProfileInsights = { reach: 0, reachGrowth: null, views: 0, viewsGrowth: null };
  const d = data || zero;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-white">{t('ui.insights.title')}</h3>
        <span className="text-[10px] text-slate-500">{t('ui.insights.last7')}</span>
      </div>
      <div className={`flex gap-3 ${!data && !failed ? 'animate-pulse' : ''}`}>
        <Stat icon={Users} label={t('ui.insights.reach')} value={d.reach} growth={d.reachGrowth} />
        <Stat icon={Eye} label={t('ui.insights.views')} value={d.views} growth={d.viewsGrowth} />
      </div>
      <p className="text-[10px] text-slate-500">
        {failed
          ? t('ui.insights.failed')
          : t('ui.insights.note')}
      </p>
    </div>
  );
};

export default InsightsCard;
