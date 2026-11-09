import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, Search, ShieldCheck } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { BulkEligibility, DecisionStatus } from '../../lib/types';
import { DECISION_LABELS } from '../../lib/constants';
import { formatInt, formatTerm } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DecisionCard, DecisionLegend } from '../../components/ui/Decision';
import { Input, Select } from '../../components/ui/Input';
import { PageHeader, StatCard } from '../../components/ui/Page';
import { TermSelect } from '../../components/ui/PaginationBar';
import { currentTermValue } from '../../lib/format';

export function EligibilityPage() {
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

  return (
    <div>
      <PageHeader
        eyebrow="أهلية التسجيل"
        title="تحقق من أهلية المقررات"
        description="كل قرار صادر عن محرك القواعد الحتمي: مؤهل، غير مؤهل، غير معروف، أو يحتاج مراجعة. لا يتم تسجيل أي مقرر."
      />

      <Card className="mb-4">
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <TermSelect value={term} onChange={setTerm} label="الفصل الدراسي" />
            <Input
              label="أكواد المقررات (اختياري)"
              dir="ltr"
              placeholder="CSC3101, AIE3201"
              value={codes}
              onChange={(event) => setCodes(event.target.value)}
              hint="اتركه فارغًا لتقييم المقررات المرشحة والراسبة."
              className="lg:col-span-2"
            />
            <Input
              label="الساعات المخططة"
              type="number"
              min={0}
              max={21}
              placeholder="12"
              value={plannedCredits}
              onChange={(event) => setPlannedCredits(event.target.value)}
              hint="لحساب قرار العبء الأكاديمي."
            />
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => void query.refetch()}
                loading={query.isFetching}
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                إعادة التقييم
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <DecisionLegend />
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock label="جارٍ تطبيق قواعد اللائحة…" />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(['ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED', 'UNKNOWN'] as DecisionStatus[]).map((status) => (
              <StatCard
                key={status}
                label={DECISION_LABELS[status].ar}
                value={counts[status]}
                icon={<span className="text-lg font-black">{counts[status]}</span>}
                tone={
                  status === 'ELIGIBLE'
                    ? 'success'
                    : status === 'NOT_ELIGIBLE'
                      ? 'danger'
                      : status === 'REVIEW_REQUIRED'
                        ? 'gold'
                        : 'neutral'
                }
                hint={`قرارات ${DECISION_LABELS[status].en}`}
              />
            ))}
          </div>

          {query.data && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>قرار العبء الأكاديمي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
                  <Badge tone="brand">الفصل: {formatTerm(query.data.data.term)}</Badge>
                  <Badge tone="neutral">الساعات المخططة: {formatInt(query.data.data.plannedCredits)}</Badge>
                  <Badge tone="gold">استشاري فقط</Badge>
                </div>
                <DecisionCard decision={query.data.data.loadDecision} />
                {query.data.data.escalations.length > 0 && (
                  <Alert tone="warning" title="تم إنشاء حالات مراجعة">
                    {query.data.data.escalations.map((item) => item.ticketNo).join(' · ')}
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-4 w-4 text-ink-400" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="بحث بكود أو قاعدة…"
                        className="h-8 w-44 rounded-lg border border-ink-200 ps-8 pe-2 text-xs focus:border-brand-400 focus:outline-none"
                      />
                    </div>
                    <Select
                      aria-label="تصفية الحالة"
                      className="h-8 w-36 text-xs"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                      options={[
                        { value: 'ALL', label: 'كل الحالات' },
                        ...(['ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED', 'UNKNOWN'] as DecisionStatus[]).map(
                          (status) => ({ value: status, label: DECISION_LABELS[status].ar }),
                        ),
                      ]}
                    />
                  </div>
                }
              >
                تفصيل القرارات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <EmptyState
                  title="لا توجد قرارات مطابقة"
                  description="جرّب تغيير الفصل أو إزالة عوامل التصفية."
                  icon={<Filter className="h-6 w-6" />}
                />
              ) : (
                <div className="grid gap-2">
                  {filtered.map((decision, index) => (
                    <DecisionCard
                      key={`${decision.course_code ?? 'load'}-${decision.rule_code}-${index}`}
                      decision={decision}
                      title={decision.course_code || 'قرار عام'}
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
