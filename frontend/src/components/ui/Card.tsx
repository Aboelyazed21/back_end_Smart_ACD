import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/format';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-100 bg-white shadow-card transition-shadow',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-ink-50 px-5 py-4 sm:px-6', className)} {...props} />;
}

export function CardTitle({
  className,
  children,
  action,
}: {
  className?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="font-display text-base font-bold text-ink-900 sm:text-lg">{children}</h2>
      {action}
    </div>
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-sm leading-6 text-ink-500', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4 sm:px-6 sm:py-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-ink-50 px-5 py-3 sm:px-6', className)}
      {...props}
    />
  );
}
