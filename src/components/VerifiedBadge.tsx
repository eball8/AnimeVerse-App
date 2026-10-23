import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { BadgeType } from '../types';

interface Props {
  badge?: BadgeType | null;
  // true: أيقونة + نص «حساب موثق» بإطار ملوّن | false: أيقونة فقط (للأماكن الضيقة)
  withText?: boolean;
  className?: string;
}

const STYLES: Record<BadgeType, { pill: string; icon: string }> = {
  gold: {
    pill: 'border-amber-400/70 bg-amber-400/10 text-amber-300',
    icon: 'text-amber-400',
  },
  red: {
    pill: 'border-red-500/70 bg-red-500/10 text-red-400',
    icon: 'text-red-500',
  },
};

const VerifiedBadge: React.FC<Props> = ({ badge, withText = false, className = '' }) => {
  const { t } = useI18n();
  if (badge !== 'gold' && badge !== 'red') return null;
  const s = STYLES[badge];
  const label = t('badge.verified');

  if (!withText) {
    return (
      <span title={label} aria-label={label} className={`inline-flex shrink-0 align-middle ${className}`}>
        <BadgeCheck className={`w-4 h-4 ${s.icon}`} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 px-1.5 py-[1px] rounded-full border text-[10px] font-bold leading-4 whitespace-nowrap align-middle ${s.pill} ${className}`}
    >
      <BadgeCheck className="w-3 h-3" />
      {label}
    </span>
  );
};

export default VerifiedBadge;
