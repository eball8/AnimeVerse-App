import React, { useCallback, useEffect, useRef } from 'react';

interface Props {
  onLongPress: () => void;
  /** مدة الضغط بالمللي ثانية */
  delay?: number;
  as?: 'div' | 'span' | 'p';
  className?: string;
  children: React.ReactNode;
}

// يلفّ أي محتوى ويستدعي onLongPress عند الضغط المطوّل (بدون قائمة التحديد الأصلية).
// الضغط المطوّل لا يُفعّل النقر العادي على الأزرار داخله.
const LongPress: React.FC<Props> = ({ onLongPress, delay = 450, as = 'div', className, children }) => {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => cancel, [cancel]);

  const Tag = as as React.ElementType;

  return (
    <Tag
      className={className}
      onPointerDown={(e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          try {
            navigator.vibrate?.(12);
          } catch {
            // الاهتزاز غير مدعوم: لا مشكلة
          }
          onLongPress();
        }, delay);
      }}
      onPointerMove={(e: React.PointerEvent) => {
        const o = origin.current;
        if (!o || timer.current === undefined) return;
        if (Math.abs(e.clientX - o.x) > 10 || Math.abs(e.clientY - o.y) > 10) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      onClickCapture={(e: React.MouseEvent) => {
        if (fired.current) {
          e.preventDefault();
          e.stopPropagation();
          fired.current = false;
        }
      }}
    >
      {children}
    </Tag>
  );
};

export default LongPress;
