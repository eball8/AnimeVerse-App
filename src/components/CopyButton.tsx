import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { copyText } from '../utils/links';

// حالة "تم النسخ" المؤقتة المشتركة بين المكوّنين
const useCopied = () => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (value: string) => {
    if (!value) return;
    if (await copyText(value)) {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return { copied, copy };
};

const useCopiedLabel = () => {
  const { lang } = useI18n();
  return lang === 'ar' ? 'تم النسخ' : lang === 'fr' ? 'Copié' : 'Copied';
};

// زر صغير (أيقونة مربعين) ينسخ القيمة، ويتحول إلى علامة ✓ بعد النسخ
export const CopyButton: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
  const { copied, copy } = useCopied();
  const label = useCopiedLabel();
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copy(value);
      }}
      aria-label={copied ? label : 'Copy'}
      className={`inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-lg border active:scale-90 transition ${
        copied
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
          : 'bg-white/5 border-white/10 text-slate-400'
      } ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// نص ينسخ نفسه بمجرد الضغط عليه، مع فقاعة صغيرة "تم النسخ"
export const CopyableText: React.FC<{ value: string; children: React.ReactNode; className?: string }> = ({
  value,
  children,
  className = '',
}) => {
  const { copied, copy } = useCopied();
  const label = useCopiedLabel();
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => copy(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') copy(value);
      }}
      className={`relative inline-block cursor-pointer active:opacity-70 transition-opacity ${className}`}
    >
      {children}
      {copied && (
        <span className="absolute -top-7 start-0 z-30 px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold whitespace-nowrap shadow-lg shadow-emerald-500/30 animate-fade-in">
          {label}
        </span>
      )}
    </span>
  );
};
