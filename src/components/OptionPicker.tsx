import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export interface PickerOption {
  value: string;
  label: string;
  /** لون اختياري يظهر كنقطة بجانب الخيار */
  color?: string;
}

interface SheetProps {
  open: boolean;
  title: string;
  options: PickerOption[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

// لوحة اختيار سفلية بديلة عن القائمة الأصلية الرمادية (select)
export const OptionSheet: React.FC<SheetProps> = ({ open, title, options, value, onSelect, onClose }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-dark-900 border-t border-x border-white/10 shadow-2xl shadow-black/60 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-slide-up"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
        <h3 className="text-sm font-black text-white text-center mb-3">{title}</h3>
        <div className="space-y-2">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value || '__none'}
                onClick={() => {
                  onSelect(o.value);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-bold active:scale-[0.98] transition-transform ${
                  active
                    ? 'bg-primary-500/15 border-primary-500/40 text-white'
                    : 'bg-white/5 border-white/10 text-slate-200'
                }`}
              >
                {o.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: o.color }} />}
                <span className="flex-1 text-start">{o.label}</span>
                {active && <Check className="w-4 h-4 text-primary-400" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface FieldProps {
  title: string;
  options: PickerOption[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** true = يملأ عرض الحاوية */
  full?: boolean;
}

// زر يعرض القيمة الحالية ويفتح لوحة الاختيار
export const PickerField: React.FC<FieldProps> = ({ title, options, value, onSelect, disabled, full }) => {
  const { dir } = useI18n();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        dir={dir}
        className={`${full ? 'w-full ' : ''}flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-dark-950 border border-white/10 text-xs text-white disabled:opacity-40 active:scale-95`}
      >
        <span className="flex items-center gap-1.5">
          {current?.color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: current.color }} />}
          {current?.label ?? '—'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>
      <OptionSheet
        open={open}
        title={title}
        options={options}
        value={value}
        onSelect={onSelect}
        onClose={() => setOpen(false)}
      />
    </>
  );
};
