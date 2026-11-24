import type { ReactNode } from 'react';
import { cn, formatNumber } from '../../lib/format';
import { Card } from './Card';

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-700">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'gold' | 'danger' | 'info' | 'neutral' | 'success';
  trend?: ReactNode;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    gold: 'bg-gold-50 text-gold-700',
    danger: 'bg-red-50 text-red-700',
    info: 'bg-sky-50 text-sky-700',
    neutral: 'bg-ink-100 text-ink-600',
    success: 'bg-emerald-50 text-emerald-700',
  };
  const bars = {
    brand: 'bg-brand-500',
    gold: 'bg-gold-300',
    danger: 'bg-red-500',
    info: 'bg-sky-500',
    neutral: 'bg-ink-300',
    success: 'bg-emerald-500',
  };
  return (
    <Card className="relative overflow-hidden p-5">
      <span aria-hidden="true" className={cn('absolute inset-y-0 start-0 w-1', bars[tone])} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p
            className={cn(
              'mt-1.5 font-display font-extrabold tabular-nums text-ink-950',
              typeof value === 'number' ? 'text-3xl leading-none' : 'text-xl leading-tight',
            )}
          >
            {typeof value === 'number' ? formatNumber(value, 0) : value}
          </p>
          {hint && <p className="mt-2 text-[11px] leading-5 text-ink-500">{hint}</p>}
          {trend && <div className="mt-2">{trend}</div>}
        </div>
        {icon && (
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function KeyValue({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-50 py-2 last:border-0', className)}>
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  label,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'gold' | 'danger' | 'success';
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const colors = { brand: 'bg-brand-600', gold: 'bg-gold-400', danger: 'bg-red-500', success: 'bg-emerald-500' };
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-ink-500">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}٪</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-all', colors[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        'max-h-72 overflow-auto rounded-xl bg-code p-4 text-xs leading-5 text-code-fg',
        className,
      )}
      dir="ltr"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
