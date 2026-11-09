import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge, ShieldAlert, TrendingUp } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { StandingResult } from '../../lib/types';
import { formatInt, formatNumber, formatTerm, currentTermValue } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DecisionCard } from '../../components/ui/Decision';
import { KeyValue, PageHeader, ProgressBar, StatCard } from '../../components/ui/Page';
import { TermSelect } from '../../components/ui/PaginationBar';
import { Badge } from '../../components/ui/Badge';

export function StandingPage() {
  const [term, setTerm] = useState(currentTermValue());
  const query = useQuery({
    queryKey: ['student', 'standing', term],
    queryFn: () => api<{ data: StandingResult }>(`/student/standing${qs({ term })}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow="الموقف الأكاديمي"
        title="الموقف والإنذارات"
        description="حساب المعدل الفصلي والتراكمي، الملاحظة الأكاديمية، خطر الفصل، والحد الأقصى للمدة النظامية وفق المادتين 16.5 و21."
        actions={<TermSelect value={term} onChange={setTerm} label="الفصل" className="w-48" />}
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError || !query.data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <StandingContent data={query.data.data} />
      )}
    </div>
  );
}

function StandingContent({ data }: { data: StandingResult }) {
  const levelName =
    typeof data.level_name === 'string' ? data.level_name : data.level_name?.ar ?? data.level_name?.en ?? `المستوى ${data.level}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="المعدل التراكمي CGPA"
          value={formatNumber(data.cgpa, 2)}
          hint={data.classification}
          icon={<Gauge className="h-5 w-5" />}
          tone={data.cgpa >= 2 ? 'brand' : 'danger'}
        />
        <StatCard
          label="المعدل الفصلي SGPA"
          value={formatNumber(data.sgpa, 2)}
          hint={formatTerm(data.term ? `${data.term.academic_year}-${data.term.season}` : undefined)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label="الساعات المجتازة"
          value={formatInt(data.passed_credits)}
          hint={`${levelName}`}
          icon={<Gauge className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="الإنذارات"
          value={formatInt(data.total_warnings)}
          hint={`${formatInt(data.consecutive_warnings)} إنذار متتالٍ`}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone={data.total_warnings > 0 ? 'danger' : 'success'}
        />
      </div>

      {data.probation && (
        <Alert tone="warning" title="ملاحظة أكاديمية">
          الطالب تحت الملاحظة الأكاديمية لأن المعدل التراكمي أقل من 2.00 بعد فصل منظم. الحد الأقصى للإنذارات قبل الفصل
          هو 4 متتالية أو 6 إجمالية.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>قرارات الموقف الأكاديمي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <DecisionCard decision={data.decision} title="الملاحظة الأكاديمية (المادة 16.5)" />
            {data.dismissal_decision && (
              <DecisionCard decision={data.dismissal_decision} title="خطر الفصل (المادة 21)" />
            )}
            <DecisionCard decision={data.suspension_decision} title="حدود الإيقاف (المادة 14)" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ملخص الموقف</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label="المستوى" value={levelName} />
              <KeyValue label="التصنيف" value={data.classification_en || data.classification} />
              <KeyValue label="إنذارات متتالية" value={formatInt(data.consecutive_warnings)} />
              <KeyValue label="إجمالي الإنذارات" value={formatInt(data.total_warnings)} />
              <KeyValue
                label="خطر الفصل"
                value={<Badge tone={data.dismissal_risk ? 'danger' : 'success'}>{data.dismissal_risk ? 'نعم' : 'لا'}</Badge>}
              />
              <KeyValue
                label="فرصة أخيرة"
                value={<Badge tone={data.final_chance ? 'warning' : 'neutral'}>{data.final_chance ? 'نعم' : 'لا'}</Badge>}
              />
              <KeyValue
                label="التخرج ممكن"
                value={data.graduation_possible_this_semester ? 'نعم هذا الفصل' : 'ليس بعد'}
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>المدة النظامية</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressBar
            value={data.regular_semesters_completed}
            max={data.max_regular_semesters}
            label="الفصول النظامية المستهلكة"
            tone={data.regular_semesters_completed >= 12 ? 'danger' : 'brand'}
          />
          <p className="mt-2 text-xs text-ink-500">
            استُهلك {formatInt(data.regular_semesters_completed)} من {formatInt(data.max_regular_semesters)} فصلاً نظاميًا.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
