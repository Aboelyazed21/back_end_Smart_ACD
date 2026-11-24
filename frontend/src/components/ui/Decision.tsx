import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/format';
import { DECISION_LABELS } from '../../lib/constants';
import type { Decision, DecisionStatus } from '../../lib/types';
import { Badge } from './Badge';

export function DecisionBadge({ status, className }: { status: DecisionStatus; className?: string }) {
  const { t } = useTranslation();
  const meta = DECISION_LABELS[status] ?? DECISION_LABELS.UNKNOWN;
  return (
    <Badge tone={meta.tone} className={className}>
      {t(meta.ar)}
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
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
      {ruleCode && <span className="font-mono font-semibold text-ink-600">{ruleCode}</span>}
      {article && <span>{t('مادة {{n}}', { n: article })}</span>}
      {page && <span>{t('ص {{n}}', { n: page })}</span>}
    </span>
  );
}

const STATUS_STRIPE: Record<DecisionStatus, string> = {
  ELIGIBLE: 'bg-emerald-500',
  NOT_ELIGIBLE: 'bg-red-500',
  REVIEW_REQUIRED: 'bg-amber-400',
  UNKNOWN: 'bg-ink-300',
};

const COURSE_CODE = /^[A-Z]{2,6}\s?\d{3,4}$/;

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
  const { t, i18n } = useTranslation();
  const hasDetails = decision.details && Object.keys(decision.details).length > 0;
  const reason =
    i18n.language === 'en' && decision.reason_en ? decision.reason_en : decision.reason_ar;
  const titleIsCode = Boolean(title && COURSE_CODE.test(title.trim()));
  const hasBadges = (decision.flags?.length ?? 0) + (decision.anomaly_ids?.length ?? 0) > 0;
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-100 bg-surface dark:border-white/[0.07]">
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 start-0 w-1', STATUS_STRIPE[decision.status] ?? STATUS_STRIPE.UNKNOWN)}
      />
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {title && (
            <span
              className={cn(
                'font-bold text-ink-900',
                titleIsCode ? 'font-mono text-[13px] tracking-wide' : 'font-display text-sm',
              )}
            >
              {title}
            </span>
          )}
          <DecisionBadge status={decision.status} />
          <span className="ms-auto">
            <RuleCitation ruleCode={decision.rule_code} article={decision.article} page={decision.page} />
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-6 text-ink-700">{reason}</p>
        {hasBadges && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
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
        )}
        {!compact && (hasDetails || children) && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 transition hover:text-brand-900"
              aria-expanded={open}
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
              {open ? t('إخفاء تفاصيل القرار') : t('عرض تفاصيل القرار')}
            </button>
            {open && (
              <div className="mt-2 space-y-2 rounded-lg border border-ink-100 bg-ink-50/60 p-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
                {children}
                {hasDetails && (
                  <pre
                    dir="ltr"
                    className="max-h-56 overflow-auto rounded-lg bg-code p-3 text-[11px] leading-5 text-code-fg"
                  >
                    {JSON.stringify(decision.details, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function DecisionLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {(Object.keys(DECISION_LABELS) as DecisionStatus[]).map((status) => (
        <DecisionBadge key={status} status={status} />
      ))}
      <span className="inline-flex items-center text-ink-500">
        {t('كل قرار مرتبط بمادة وصفحة في اللائحة')}
      </span>
    </div>
  );
}
