import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Filter, HelpCircle, Search, XCircle } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { BulkEligibility, DecisionStatus } from '../../lib/types';
import { DECISION_LABELS } from '../../lib/constants';
import { formatInt, formatTerm } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { DecisionCard, DecisionLegend } from '../../components/ui/Decision';
import { Input, Select } from '../../components/ui/Input';
import { PageHeader, StatCard } from '../../components/ui/Page';
import { TermSelect } from '../../components/ui/PaginationBar';
import { currentTermValue } from '../../lib/format';

const DECISION_ORDER: DecisionStatus[] = ['ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED', 'UNKNOWN'];

const STAT_ICONS: Record<DecisionStatus, ReactNode> = {
  ELIGIBLE: <CheckCircle2 className="h-5 w-5" />,
  NOT_ELIGIBLE: <XCircle className="h-5 w-5" />,
  REVIEW_REQUIRED: <AlertTriangle className="h-5 w-5" />,
  UNKNOWN: <HelpCircle className="h-5 w-5" />,
};

const STAT_TONES: Record<DecisionStatus, 'success' | 'danger' | 'gold' | 'neutral'> = {
  ELIGIBLE: 'success',
  NOT_ELIGIBLE: 'danger',
  REVIEW_REQUIRED: 'gold',
  UNKNOWN: 'neutral',
};

export function EligibilityPage() {
  const { t } = useTranslation();
  const [term, setTerm] = useState(currentTermValue());
  const [codes, setCodes] = useState('');
  const [plannedCredits, setPlannedCredits] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DecisionStatus>('ALL');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['student', 'eligibility', term, codes, plannedCredits],
    queryFn: () =>
      api<{ data: BulkEligibility }>(
        `/student/eligibility${qs({ term, courseCodes: codes, plannedCredits })}`,
      ),
  });

  const decisions = useMemo(() => query.data?.data.decisions ?? [], [query.data]);
  const counts = useMemo(() => {
    const base: Record<DecisionStatus, number> = {
      ELIGIBLE: 0,
      NOT_ELIGIBLE: 0,
      UNKNOWN: 0,
      REVIEW_REQUIRED: 0,
    };
    for (const decision of decisions) base[decision.status] += 1;
    return base;
  }, [decisions]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toUpperCase();
    return decisions.filter((decision) => {
      if (statusFilter !== 'ALL' && decision.status !== statusFilter) return false;
      if (!normalized) return true;
      return (
        decision.course_code?.includes(normalized) ||
        decision.rule_code.toUpperCase().includes(normalized) ||
        decision.reason_ar.includes(search.trim()) ||
        decision.reason_en.toUpperCase().includes(normalized)
      );
    });
  }, [decisions, statusFilter, search]);

  const total = decisions.length;

  return (
    <div>
      <PageHeader
        eyebrow={t('أهلية التسجيل')}
        title={t('تحقق من أهلية المقررات')}
        description={t(
          'كل قرار صادر عن محرك القواعد الحتمي: مؤهل، غير مؤهل، غير معروف، أو يحتاج مراجعة. لا يتم تسجيل أي مقرر.',
        )}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('معايير التقييم')}</CardTitle>
          <CardDescription className="text-xs leading-5">
            {t(
              'اترك أكواد المقررات فارغة لتقييم المقررات المرشحة والراسبة، وأدخل الساعات المخططة لحساب قرار العبء.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 sm:pt-4">
          <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2.2fr)_minmax(0,1fr)_auto]">
            <TermSelect value={term} onChange={setTerm} label={t('الفصل الدراسي')} />
            <Input
              label={t('أكواد المقررات (اختياري)')}
              dir="ltr"
              placeholder="CSC3101, AIE3201"
              value={codes}
              onChange={(event) => setCodes(event.target.value)}
            />
            <Input
              label={t('الساعات المخططة')}
              type="number"
              min={0}
              max={21}
              placeholder="12"
              value={plannedCredits}
              onChange={(event) => setPlannedCredits(event.target.value)}
            />
            <Button
              className="px-6"
              onClick={() => void query.refetch()}
              loading={query.isFetching}
            >
              {t('إعادة التقييم')}
            </Button>
          </div>
        </CardContent>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-2xl border-t border-ink-50 bg-ink-50/60 px-5 py-3 sm:px-6 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <span className="text-xs font-semibold text-ink-600">{t('دلالة الحالات')}</span>
          <DecisionLegend />
        </div>
      </Card>

      {query.isLoading ? (
        <LoadingBlock label={t('جارٍ تطبيق قواعد اللائحة…')} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {DECISION_ORDER.map((status) => {
              const pct = total === 0 ? 0 : Math.round((counts[status] / total) * 100);
              return (
                <StatCard
                  key={status}
                  label={t(DECISION_LABELS[status].ar)}
                  value={counts[status]}
                  icon={STAT_ICONS[status]}
                  tone={STAT_TONES[status]}
                  hint={t('{{pct}}٪ من القرارات', { pct: formatInt(pct) })}
                />
              );
            })}
          </div>

          {query.data && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle action={<Badge tone="gold">{t('استشاري فقط')}</Badge>}>
                  {t('قرار العبء الأكاديمي')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                  <span>{t('الفصل: {{term}}', { term: formatTerm(query.data.data.term) })}</span>
                  <span aria-hidden="true" className="text-ink-300">
                    ·
                  </span>
                  <span>
                    {t('الساعات المخططة: {{n}}', { n: formatInt(query.data.data.plannedCredits) })}
                  </span>
                </div>
                <DecisionCard decision={query.data.data.loadDecision} />
                {query.data.data.escalations.length > 0 && (
                  <Alert tone="warning" title={t('تم إنشاء حالات مراجعة')}>
                    {query.data.data.escalations.map((item) => item.ticketNo).join(' · ')}
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-ink-900 sm:text-lg">
                    {t('تفصيل القرارات')}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {t('عرض {{shown}} من {{total}}', {
                      shown: formatInt(filtered.length),
                      total: formatInt(total),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-ink-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t('بحث بكود أو قاعدة…')}
                      className="h-9 w-48 rounded-lg border border-ink-200 bg-surface ps-8 pe-3 text-xs text-ink-800 shadow-sm transition placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                    />
                  </div>
                  <Select
                    aria-label={t('تصفية الحالة')}
                    className="h-9 w-36 text-xs"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                    options={[
                      { value: 'ALL', label: t('كل الحالات') },
                      ...DECISION_ORDER.map((status) => ({
                        value: status,
                        label: t(DECISION_LABELS[status].ar),
                      })),
                    ]}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <EmptyState
                  title={t('لا توجد قرارات مطابقة')}
                  description={t('جرّب تغيير الفصل أو إزالة عوامل التصفية.')}
                  icon={<Filter className="h-6 w-6" />}
                />
              ) : (
                <div className="space-y-2">
                  {filtered.map((decision, index) => (
                    <DecisionCard
                      key={`${decision.course_code ?? 'load'}-${decision.rule_code}-${index}`}
                      decision={decision}
                      title={decision.course_code || t('قرار عام')}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
