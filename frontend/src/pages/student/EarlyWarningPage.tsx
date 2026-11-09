import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowUpRight, BookX, CheckCircle2 } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { EarlyWarningResult } from '../../lib/types';
import { formatInt, formatNumber, currentTermValue } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader, ProgressBar, StatCard } from '../../components/ui/Page';
import { TermSelect } from '../../components/ui/PaginationBar';

const RISK_META = {
  LOW: { ar: 'منخفض', tone: 'success' as const },
  MEDIUM: { ar: 'متوسط', tone: 'warning' as const },
  HIGH: { ar: 'مرتفع', tone: 'danger' as const },
};

export function EarlyWarningPage() {
  const [term, setTerm] = useState(currentTermValue());
  const query = useQuery({
    queryKey: ['student', 'early-warning', term],
    queryFn: () => api<{ data: EarlyWarningResult }>(`/student/early-warning${qs({ term })}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow="الإنذار المبكر"
        title="مؤشرات المخاطر الأكاديمية"
        description="مؤشرات قابلة للتفسير تعتمد على المعدل التراكمي، المقررات الراسبة، الحضور، العبء، والإنذارات. كل مؤشر مرتبط بقاعدة ومادة."
        actions={<TermSelect value={term} onChange={setTerm} label="الفصل" className="w-48" />}
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError || !query.data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <WarningContent data={query.data.data} />
      )}
    </div>
  );
}

function WarningContent({ data }: { data: EarlyWarningResult }) {
  const risk = RISK_META[data.risk_level];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مستوى الخطر"
          value={risk.ar}
          hint={`درجة ${formatInt(data.risk_score)} / 100`}
          icon={<Activity className="h-5 w-5" />}
          tone={data.risk_level === 'HIGH' ? 'danger' : data.risk_level === 'MEDIUM' ? 'gold' : 'success'}
        />
        <StatCard label="المعدل التراكمي" value={formatNumber(data.cgpa, 2)} icon={<ArrowUpRight className="h-5 w-5" />} />
        <StatCard
          label="العبء الحالي"
          value={`${formatInt(data.current_load)} / ${formatInt(data.max_load)}`}
          hint="ساعة معتمدة"
          icon={<BookX className="h-5 w-5" />}
          tone={data.current_load > data.max_load ? 'danger' : 'info'}
        />
        <StatCard
          label="المقررات الراسبة"
          value={formatInt(data.failed_course_codes.length)}
          hint={data.failed_course_codes.slice(0, 4).join(' · ') || 'لا يوجد'}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={data.failed_course_codes.length ? 'danger' : 'success'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle action={<Badge tone={risk.tone}>{risk.ar}</Badge>}>المؤشرات المرصودة</CardTitle>
          </CardHeader>
          <CardContent>
            {data.indicators.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                لا توجد مؤشرات خطر حالية. استمر في المتابعة الدورية.
              </div>
            ) : (
              <div className="space-y-2">
                {data.indicators.map((indicator) => (
                  <div key={indicator.code} className="rounded-xl border border-ink-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">{indicator.message_ar}</p>
                      <Badge tone={indicator.severity === 'high' ? 'danger' : indicator.severity === 'medium' ? 'warning' : 'neutral'}>
                        {indicator.severity === 'high' ? 'مرتفع' : indicator.severity === 'medium' ? 'متوسط' : 'منخفض'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink-500">{indicator.message_en}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-400">
                      {indicator.rule_code} · مادة {indicator.article} · ص {indicator.page}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>درجة الخطر</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar
                value={data.risk_score}
                max={100}
                label="نسبة الخطورة"
                tone={data.risk_level === 'HIGH' ? 'danger' : data.risk_level === 'MEDIUM' ? 'gold' : 'success'}
              />
              <div className="mt-4 space-y-2 text-xs text-ink-600">
                <p className="flex justify-between">
                  <span>ملاحظة أكاديمية</span>
                  <Badge tone={data.probation ? 'danger' : 'success'}>{data.probation ? 'نعم' : 'لا'}</Badge>
                </p>
                <p className="flex justify-between">
                  <span>خطر الفصل</span>
                  <Badge tone={data.dismissal_risk ? 'danger' : 'success'}>{data.dismissal_risk ? 'نعم' : 'لا'}</Badge>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>إجراءات مقترحة</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-ink-700">
                {data.recommended_actions.map((action) => (
                  <li key={action} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {action}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Alert tone="neutral" title="هذه المؤشرات استشارية">
        لا تُصدر إنذارات رسمية من هذه الصفحة. الإنذار الأكاديمي وإجراءات الفصل من اختصاص مجلس الكلية وفق اللائحة.
      </Alert>
    </div>
  );
}
