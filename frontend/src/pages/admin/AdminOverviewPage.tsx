import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Inbox,
  TriangleAlert,
  Upload,
  Users,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { AnalyticsOverview, BottleneckRow } from '../../lib/types';
import { formatInt, formatNumber } from '../../lib/format';
import { ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader, StatCard } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

function count(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

export function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ['admin', 'analytics', 'overview'],
    queryFn: () => api<{ data: AnalyticsOverview }>('/admin/analytics/overview'),
  });
  const bottlenecks = useQuery({
    queryKey: ['admin', 'analytics', 'bottlenecks'],
    queryFn: () => api<{ data: BottleneckRow[] }>('/admin/analytics/bottlenecks?limit=8'),
  });

  if (overview.isLoading) return <LoadingBlock label="جارٍ تحميل لوحة المسؤول…" />;
  if (overview.isError || !overview.data) {
    return <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  }

  const data = overview.data.data;
  const plans = data.plans;
  const escalations = data.escalations;
  const anomalies = data.anomalies;

  return (
    <div>
      <PageHeader
        eyebrow="لوحة المسؤول"
        title="نظرة عامة على المنصة"
        description="مؤشرات التشغيل، الخطط، الحالات المحوّلة، وتعارضات البيانات. كل تغيير إداري يُسجّل في سجل التدقيق."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="الطلاب"
          value={formatInt(data.students.count)}
          hint={`متوسط CGPA ${formatNumber(data.students.averageCgpa, 2)}`}
          icon={<GraduationCap className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="المرشدون"
          value={formatInt(data.advisors)}
          hint={`${formatInt(data.courses)} مقرر نشط`}
          icon={<Users className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label="الخطط الدراسية"
          value={formatInt(plans.total)}
          hint={`${formatInt(plans.draft)} مسودة · ${formatInt(plans.submitted)} مقدّمة`}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="حالات مفتوحة"
          value={formatInt(escalations.open)}
          hint={`${formatInt(escalations.critical)} حرجة من ${formatInt(escalations.total)}`}
          icon={<Inbox className="h-5 w-5" />}
          tone={count(escalations.critical) > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickCard
          to="/admin/anomalies?status=open"
          title="تعارضات مفتوحة"
          value={formatInt(anomalies.open)}
          hint={`${formatInt(anomalies.blocking)} مانعة — توقف القرارات`}
          icon={<TriangleAlert className="h-5 w-5" />}
          tone={count(anomalies.blocking) > 0 ? 'danger' : 'warning'}
        />
        <QuickCard
          to="/admin/escalations?status=open"
          title="حالات بانتظار العمل"
          value={formatInt(escalations.open)}
          hint="مفتوحة أو قيد المراجعة"
          icon={<Inbox className="h-5 w-5" />}
          tone="warning"
        />
        <QuickCard
          to="/admin/imports"
          title="عمليات الاستيراد"
          value={formatInt(data.imports.total)}
          hint={`${formatInt(data.imports.failed)} فاشلة`}
          icon={<Upload className="h-5 w-5" />}
          tone="info"
        />
        <QuickCard
          to="/admin/users"
          title="المستخدمون النشطون"
          value={formatInt(data.users.active)}
          hint={`من ${formatInt(data.users.total)} حساب`}
          icon={<Users className="h-5 w-5" />}
          tone="brand"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle
              action={
                <Link to="/admin/analytics" className="text-xs font-bold text-brand-700 hover:underline">
                  التحليلات الكاملة
                </Link>
              }
            >
              المقررات الحرجة (اختناقات)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottlenecks.isLoading ? (
              <LoadingBlock />
            ) : bottlenecks.isError ? (
              <ErrorState message={errorMessage(bottlenecks.error)} onRetry={() => void bottlenecks.refetch()} />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>المقرر</Th>
                      <Th>الرسوب</Th>
                      <Th>نسبة الرسوب</Th>
                      <Th>يفتح لاحقًا</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {(bottlenecks.data?.data.length ?? 0) === 0 ? (
                      <TableEmpty colSpan={4} message="لا توجد بيانات كافية." />
                    ) : (
                      bottlenecks.data?.data.map((row) => (
                        <Tr key={row.code}>
                          <Td>
                            <p className="font-mono text-xs font-bold text-brand-700">{row.code}</p>
                            <p className="text-sm font-semibold text-ink-900">{row.name_ar}</p>
                          </Td>
                          <Td>
                            {formatInt(row.failure_count)} / {formatInt(row.attempts)}
                          </Td>
                          <Td>
                            <Badge tone={row.failure_rate_pct >= 30 ? 'danger' : row.failure_rate_pct >= 15 ? 'warning' : 'neutral'}>
                              {formatNumber(row.failure_rate_pct, 1)}٪
                            </Badge>
                          </Td>
                          <Td>{formatInt(row.downstream_unlocks)} مقرر</Td>
                        </Tr>
                      ))
                    )}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ملخص سريع</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3">
              <span className="text-ink-600">خطط معتمدة</span>
              <span className="font-bold text-emerald-700">{formatInt(plans.approved)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3">
              <span className="text-ink-600">خطط بانتظار المراجعة</span>
              <span className="font-bold text-warning">{formatInt(plans.submitted)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3">
              <span className="text-ink-600">كل التعارضات</span>
              <span className="font-bold">{formatInt(anomalies.total)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3">
              <span className="text-ink-600">المقررات</span>
              <span className="font-bold">{formatInt(data.courses)}</span>
            </div>
            <Link
              to="/admin/courses"
              className="flex items-center justify-between rounded-xl border border-ink-200 p-3 text-sm font-semibold text-ink-700 transition hover:border-brand-300 hover:bg-brand-50/30"
            >
              إدارة المقررات <BookOpen className="h-4 w-4 text-brand-600" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
        <p className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" /> قاعدة التشغيل
        </p>
        أي تعارض مانع (blocking) يوقف القرار ويحوّله للمراجعة. حل التعارض يعيد تقييم كل القرارات المتأثرة تلقائيًا ويُسجّل
        في سجل التدقيق.
      </div>
    </div>
  );
}

function QuickCard({
  to,
  title,
  value,
  hint,
  icon,
  tone,
}: {
  to: string;
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: 'danger' | 'warning' | 'info' | 'brand';
}) {
  const tones = {
    danger: 'text-danger bg-red-50',
    warning: 'text-amber-700 bg-amber-50',
    info: 'text-sky-700 bg-sky-50',
    brand: 'text-brand-700 bg-brand-50',
  };
  return (
    <Link
      to={to}
      className="flex items-start justify-between gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition hover:border-brand-300 hover:shadow-float"
    >
      <div>
        <p className="text-xs font-semibold text-ink-500">{title}</p>
        <p className="mt-1 font-display text-xl font-extrabold text-ink-950">{value}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-ink-500">{hint}</p>
      </div>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
    </Link>
  );
}
