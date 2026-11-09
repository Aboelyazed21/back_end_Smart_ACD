import { useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/format';
import { DECISION_LABELS } from '../../lib/constants';
import type { Decision, DecisionStatus } from '../../lib/types';
import { Badge } from './Badge';

export function DecisionBadge({ status, className }: { status: DecisionStatus; className?: string }) {
  const meta = DECISION_LABELS[status] ?? DECISION_LABELS.UNKNOWN;
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.ar}
    </Badge>
  );
}

export function RuleCitation({
  ruleCode,
  article,
  page,
}: {
  ruleCode?: string;
  article?: string;
  page?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
      {ruleCode && <span className="font-mono font-semibold text-ink-600">{ruleCode}</span>}
      {article && <span>مادة {article}</span>}
      {page && <span>ص {page}</span>}
    </span>
  );
}

export function DecisionCard({
  decision,
  title,
  compact = false,
  children,
}: {
  decision: Decision;
  title?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = decision.details && Object.keys(decision.details).length > 0;
  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4',
        decision.status === 'ELIGIBLE' && 'border-emerald-200',
        decision.status === 'NOT_ELIGIBLE' && 'border-red-200',
        decision.status === 'REVIEW_REQUIRED' && 'border-amber-200',
        decision.status === 'UNKNOWN' && 'border-ink-200',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {title && <p className="font-display text-sm font-bold text-ink-900">{title}</p>}
          <p className={cn('text-sm leading-6 text-ink-700', title && 'mt-1')}>{decision.reason_ar}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RuleCitation ruleCode={decision.rule_code} article={decision.article} page={decision.page} />
            {decision.flags?.map((flag) => (
              <Badge key={flag} tone="neutral" className="text-[10px]">
                {flag}
              </Badge>
            ))}
            {decision.anomaly_ids?.map((id) => (
              <Badge key={id} tone="warning" className="text-[10px] font-mono">
                {id}
              </Badge>
            ))}
          </div>
        </div>
        <DecisionBadge status={decision.status} />
      </div>
      {!compact && (hasDetails || children) && (
        <div className="mt-3 border-t border-ink-100 pt-2">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
            aria-expanded={open}
          >
            <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
            {open ? 'إخفاء تفاصيل القرار' : 'عرض تفاصيل القرار'}
          </button>
          {open && (
            <div className="mt-3 space-y-2">
              {children}
              {hasDetails && (
                <pre
                  dir="ltr"
                  className="max-h-56 overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] leading-5 text-ink-100"
                >
                  {JSON.stringify(decision.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DecisionLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {(Object.keys(DECISION_LABELS) as DecisionStatus[]).map((status) => (
        <DecisionBadge key={status} status={status} />
      ))}
      <span className="inline-flex items-center gap-1 text-ink-500">
        <ExternalLink className="h-3 w-3" /> كل قرار مرتبط بمادة وصفحة في اللائحة
      </span>
    </div>
  );
}
