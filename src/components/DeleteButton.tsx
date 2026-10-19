import React from 'react';
import { Trash2 } from 'lucide-react';

type Variant = 'soft' | 'glass' | 'ghost';

interface Props extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** soft: بطاقات المنشورات | glass: فوق الصور والفيديو (القصص) | ghost: صغير داخل القوائم (التعليقات) */
  variant?: Variant;
  label: string;
}

const styles: Record<Variant, { btn: string; icon: string }> = {
  soft: {
    btn: 'w-9 h-9 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 active:bg-red-500/30',
    icon: 'w-[18px] h-[18px]',
  },
  glass: {
    btn: 'w-9 h-9 bg-black/35 backdrop-blur-md border border-white/15 text-white hover:bg-red-500/60 active:bg-red-500/70',
    icon: 'w-[18px] h-[18px]',
  },
  ghost: {
    btn: 'w-7 h-7 text-slate-500 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/15',
    icon: 'w-4 h-4',
  },
};

const DeleteButton: React.FC<Props> = ({ variant = 'soft', label, type = 'button', ...rest }) => {
  const s = styles[variant];
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      {...rest}
      className={`shrink-0 rounded-full flex items-center justify-center transition active:scale-90 ${s.btn}`}
    >
      <Trash2 className={s.icon} strokeWidth={1.8} />
    </button>
  );
};

export default DeleteButton;
