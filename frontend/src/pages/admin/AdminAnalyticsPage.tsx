import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BookOpen, ClipboardList, GraduationCap, Inbox, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type {
  AnalyticsOverview,
  BottleneckRow,
  EnrollmentStatRow,
  EscalationStatRow,
  PlanStatRow,
} from '../../lib/types';
import { ESCALATION_TYPE_LABELS, PLAN_STATUS_LABELS, PROGRAM_LABELS } from '../../lib/constants';
import { formatInt, formatNumber } from '../../lib/format';
import { ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader, ProgressBar, StatCard } from '../../components/ui/Page';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

const COLORS = ['#003a75', '#c9a227', '#0284c7', '#dc2626', '#7c3aed', '#64748b', '#059669', '#d97706'];

function num(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

export function AdminAnalyticsPage() {
  const { t } = useTranslation();
  const overview = useQuery({
    queryKey: ['admin', 'analytics', 'overview'],
    queryFn: () => api<{ data: AnalyticsOverview }>('/admin/analytics/overview'),
  });
  const bottlenecks = useQuery({
    queryKey: ['admin', 'analytics', 'bottlenecks'],
    queryFn: () => api<{ data: BottleneckRow[] }>('/admin/analytics/bottlenecks?limit=15'),
  });
  const enrollments = useQuery({
    queryKey: ['admin', 'analytics', 'enrollments'],
    queryFn: () => api<{ data: EnrollmentStatRow[] }>('/admin/analytics/enrollments'),
  });
  const escalations = useQuery({
    queryKey: ['admin', 'analytics', 'escalations'],
    queryFn: () => api<{ data: EscalationStatRow[] }>('/admin/analytics/escalations'),
  });
  const plans = useQuery({
    queryKey: ['admin', 'analytics', 'plans'],
    queryFn: () => api<{ data: PlanStatRow[] }>('/admin/analytics/plans'),
  });

  if (overview.isLoading) return <LoadingBlock label={t('جارٍ تحميل التحليلات…')} />;
  if (overview.isError || !overview.data) {
    return <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  }

  const data = overview.data.data;
  const bottleneckRows = bottlenecks.data?.data ?? [];
  const planRows = plans.data?.data ?? [];
  const escalationRows = escalations.data?.data ?? [];
  const enrollmentRows = enrollments.data?.data ?? [];

  const planChart = planRows.map((row) => ({
    name: t(PLAN_STATUS_LABELS[row.status]?.ar ?? row.status),
    value: num(row.count),
  }));

  const escalationByType = Object.entries(
    escalationRows.reduce<Record<string, number>>((acc, row) => {
      const key = t(ESCALATION_TYPE_LABELS[row.type] ?? row.type);
      acc[key] = (acc[key] ?? 0) + num(row.count);
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const enrollmentByProgram = Object.entries(
    enrollmentRows.reduce<Record<string, { students: number; failures: number }>>((acc, row) => {
      const key = t(PROGRAM_LABELS[row.program]?.ar ?? row.program);
      acc[key] = {
        students: (acc[key]?.students ?? 0) + num(row.students),
        failures: (acc[key]?.failures ?? 0) + num(row.failures),
      };
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, students: value.students, failures: value.failures }));

  return (
    <div>
      <PageHeader
        eyebrow={t('التحليلات')}
        title={t('مؤشرات الكلية')}
        description={t(
          'قراءة تشغيلية للبيانات المخزّنة فقط. كل رقم قابل للتتبع إلى السجلات الأصلية، ولا تُستخدم هذه المؤشرات لتجاوز قواعد اللائحة.',
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('الطلاب')}
          value={formatInt(data.students.count)}
          hint={t('متوسط CGPA {{cgpa}}', { cgpa: formatNumber(data.students.averageCgpa, 2) })}
          icon={<GraduationCap className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label={t('المرشدون')}
          value={formatInt(data.advisors)}
          hint={t('{{n}} مقرر', { n: formatInt(data.courses) })}
          icon={<Users className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label={t('الخطط')}
          value={formatInt(data.plans.total)}
          hint={t('{{n}} معتمدة', { n: formatInt(data.plans.approved) })}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label={t('حالات مفتوحة')}
          value={formatInt(data.escalations.open)}
          hint={t('{{n}} حرجة', { n: formatInt(data.escalations.critical) })}
          icon={<Inbox className="h-5 w-5" />}
          tone={num(data.escalations.critical) > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle
              action={
                <Badge tone="warning">{t('{{n}} مفتوح', { n: formatInt(data.anomalies.open) })}</Badge>
              }
            >
              {t('التعارضات')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar
              value={num(data.anomalies.blocking)}
              max={Math.max(1, num(data.anomalies.total))}
              label={t('تعارضات مانعة من الإجمالي')}
              tone="danger"
            />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="font-display text-xl font-extrabold">{formatInt(data.anomalies.total)}</p>
                <p className="text-[11px] text-ink-500">{t('إجمالي')}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="font-display text-xl font-extrabold text-amber-800">{formatInt(data.anomalies.open)}</p>
                <p className="text-[11px] text-amber-700">{t('مفتوح')}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="font-display text-xl font-extrabold text-danger">{formatInt(data.anomalies.blocking)}</p>
                <p className="text-[11px] text-red-700">{t('مانع')}</p>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">
              <p className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-3.5 w-3.5" /> {t('أثر تشغيلي')}
              </p>
              {t(
                'كل تعارض مانع يوقف القرارات المرتبطة حتى يُحل. راجع صفحة التعارضات أولًا في أي تحقيق.',
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('توزيع الخطط')}</CardTitle>
          </CardHeader>
          <CardContent>
            {planChart.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-500">{t('لا توجد خطط بعد.')}</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={planChart} dataKey="value" nameKey="name" outerRadius={90} innerRadius={45} paddingAngle={2}>
                      {planChart.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatInt(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle
              action={<span className="text-xs text-ink-500">{t('أعلى 15 مقررًا')}</span>}
            >
              {t('المقررات الحرجة (الاختناقات)')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottlenecks.isLoading ? (
              <LoadingBlock />
            ) : bottlenecks.isError ? (
              <ErrorState message={errorMessage(bottlenecks.error)} onRetry={() => void bottlenecks.refetch()} />
            ) : bottleneckRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-500">{t('لا توجد بيانات كافية.')}</p>
            ) : (
              <>
                <div className="mb-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bottleneckRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value, key) => [
                          formatInt(Number(value)),
                          key === 'failure_count' ? t('رسوب') : t('محاولات'),
                        ]}
                      />
                      <Bar dataKey="failure_count" name={t('رسوب')} fill="#dc2626" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="attempts" name={t('محاولات')} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <TableWrap>
                  <Table>
                    <THead>
                      <Tr>
                        <Th>{t('المقرر')}</Th>
                        <Th>{t('المحاولات')}</Th>
                        <Th>{t('الرسوب')}</Th>
                        <Th>{t('النسبة')}</Th>
                        <Th>{t('يفتح لاحقًا')}</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {bottleneckRows.map((row) => (
                        <Tr key={row.code}>
                          <Td>
                            <p className="font-mono text-xs font-bold text-brand-700">{row.code}</p>
                            <p className="text-sm font-semibold text-ink-900">{row.name_ar}</p>
                          </Td>
                          <Td>{formatInt(row.attempts)}</Td>
                          <Td>{formatInt(row.failure_count)}</Td>
                          <Td>
                            <Badge
                              tone={
                                row.failure_rate_pct >= 30 ? 'danger' : row.failure_rate_pct >= 15 ? 'warning' : 'neutral'
                              }
                            >
                              {t('{{pct}}٪', { pct: formatNumber(row.failure_rate_pct, 1) })}
                            </Badge>
                          </Td>
                          <Td>{formatInt(row.downstream_unlocks)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('التسجيل حسب البرنامج')}</CardTitle>
          </CardHeader>
          <CardContent>
            {enrollmentByProgram.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-500">{t('لا توجد بيانات.')}</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={enrollmentByProgram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatInt(Number(value))} />
                    <Legend />
                    <Bar dataKey="students" name={t('طلاب')} fill="#003a75" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failures" name={t('رسوب')} fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('الحالات حسب النوع')}</CardTitle>
          </CardHeader>
          <CardContent>
            {escalationByType.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-500">{t('لا توجد حالات.')}</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={escalationByType} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(value) => formatInt(Number(value))} />
                    <Bar dataKey="value" name={t('حالات')} fill="#c9a227" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t('تفصيل التسجيل حسب المستوى')}</CardTitle>
          </CardHeader>
          <CardContent>
            {enrollmentRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-500">{t('لا توجد بيانات.')}</p>
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>{t('البرنامج')}</Th>
                      <Th>{t('المستوى')}</Th>
                      <Th>{t('الطلاب')}</Th>
                      <Th>{t('المتوسط')}</Th>
                      <Th>{t('التسجيلات')}</Th>
                      <Th>{t('الرسوب')}</Th>
                      <Th>{t('المعدل')}</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {enrollmentRows.map((row, index) => (
                      <Tr key={`${row.program}-${row.level}-${index}`}>
                        <Td>
                          <Badge tone="brand">{PROGRAM_LABELS[row.program]?.short ?? row.program}</Badge>
                        </Td>
                        <Td>{formatInt(row.level)}</Td>
                        <Td>{formatInt(row.students)}</Td>
                        <Td>{formatNumber(row.average_cgpa, 2)}</Td>
                        <Td>{formatInt(row.enrollments)}</Td>
                        <Td>{formatInt(row.failures)}</Td>
                        <Td>
                          <Badge
                            tone={
                              num(row.failures) > 0 && num(row.failures) / Math.max(1, num(row.enrollments)) >= 0.3
                                ? 'danger'
                                : 'neutral'
                            }
                          >
                            {t('{{pct}}٪', {
                              pct: formatNumber((num(row.failures) / Math.max(1, num(row.enrollments))) * 100, 1),
                            })}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t('مؤشرات سريعة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-500">{t('مستخدمون نشطون')}</p>
                <p className="font-display text-xl font-extrabold">{formatInt(data.users.active)}</p>
                <p className="text-[11px] text-ink-500">
                  {t('من {{n}} حساب', { n: formatInt(data.users.total) })}
                </p>
              </div>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-500">{t('خطط مسودة')}</p>
                <p className="font-display text-xl font-extrabold">{formatInt(data.plans.draft)}</p>
                <p className="text-[11px] text-ink-500">{t('لا تُعد تسجيلًا')}</p>
              </div>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-500">{t('عمليات استيراد')}</p>
                <p className="font-display text-xl font-extrabold">{formatInt(data.imports.total)}</p>
                <p className="text-[11px] text-red-700">
                  {t('{{n}} فاشلة', { n: formatInt(data.imports.failed) })}
                </p>
              </div>
              <div className="rounded-xl border border-ink-100 p-3">
                <p className="text-xs text-ink-500">{t('المقررات')}</p>
                <p className="font-display text-xl font-extrabold">{formatInt(data.courses)}</p>
                <p className="flex items-center gap-1 text-[11px] text-ink-500">
                  <BookOpen className="h-3 w-3" /> {t('نشطة في الكتالوج')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
