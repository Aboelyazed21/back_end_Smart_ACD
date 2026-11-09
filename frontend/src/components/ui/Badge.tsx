import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/format';

export type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'brand' | 'gold';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-50 text-ink-700 ring-ink-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  gold: 'bg-gold-50 text-gold-800 ring-gold-200',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral' }: { tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: 'bg-ink-400',
    success: 'bg-emerald-500',
    danger: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-sky-500',
    brand: 'bg-brand-500',
    gold: 'bg-gold-400',
  };
  return <span className={cn('inline-block h-2 w-2 rounded-full', colors[tone])} aria-hidden />;
}
