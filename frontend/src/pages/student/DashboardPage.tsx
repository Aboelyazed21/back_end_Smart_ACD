import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CalendarDays,
  GraduationCap,
  ShieldAlert,
  Target,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import { PLAN_STATUS_LABELS } from '../../lib/constants';
import { formatInt, formatNumber, formatTerm } from '../../lib/format';
import type { StudentDashboard } from '../../lib/types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader, ProgressBar, StatCard } from '../../components/ui/Page';
import { EmptyState, ErrorState, LoadingBlock, Alert } from '../../components/ui/Feedback';
import { TermSelect } from '../../components/ui/PaginationBar';
import { currentTermValue } from '../../lib/format';

export function StudentDashboardPage() {
  const { t } = useTranslation();
  const [term, setTerm] = useState(currentTermValue());
  const query = useQuery({
    queryKey: ['student', 'dashboard', term],
    queryFn: () => api<{ data: StudentDashboard }>(`/student/dashboard${qs({ term })}`),
  });

  if (query.isLoading) return <LoadingBlock label={t('جارٍ تحميل لوحة المتابعة…')} />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data.data;
  const { profile, standing, graduation } = data;
  const student = profile.student;
  const cgpa = Number(standing?.cgpa ?? student.cgpa ?? 0);

  return (
    <div>
      <PageHeader
        eyebrow={t('لوحة الطالب')}
        title={t('أهلًا، {{name}} — {{term}}', {
          name: student.fullName ?? '',
          term: data.term.value ? formatTerm(data.term.value) : '',
        })}
        description={t(
          'ملخص موقفك الأكاديمي، مقرراتك الحالية، وآخر الخطط الاستشارية. جميع القرارات مرتبطة بنصوص اللائحة.',
        )}
        actions={<TermSelect value={term} onChange={setTerm} label={t('الفصل')} className="w-48" />}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('المعدل التراكمي')}
          value={formatNumber(cgpa, 2)}
          hint={cgpa >= 2 ? t('موقف أكاديمي سليم') : t('أقل من حد 2.00 — يحتاج متابعة')}
          icon={<GraduationCap className="h-5 w-5" />}
          tone={cgpa >= 2 ? 'brand' : 'danger'}
        />
        <StatCard
          label={t('الساعات المجتازة')}
          value={formatInt(graduation.passedCredits)}
          hint={t('من {{n}} ساعة مطلوبة', { n: formatInt(graduation.requiredCredits) })}
          icon={<BookOpen className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label={t('المتبقي للتخرج')}
          value={formatInt(graduation.remainingCredits)}
          hint={t('وفق الحد الأدنى للساعات')}
          icon={<Target className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label={t('الإشعارات غير المقروءة')}
          value={formatInt(data.unreadNotifications)}
          hint={data.unreadNotifications ? t('لديك تحديثات جديدة') : t('لا توجد إشعارات جديدة')}
          icon={<Bell className="h-5 w-5" />}
          tone="neutral"
        />
      </div>

      {standing?.probation && (
        <Alert
          tone="warning"
          className="mb-4"
          title={t('الطالب تحت الملاحظة الأكاديمية')}
          icon={<ShieldAlert className="h-5 w-5" />}
        >
          {t('المعدل التراكمي أقل من 2.00 بعد فصل منظم. راجع مرشدك الأكاديمي واطلع على خطة الإنذار المبكر.')}
          {standing.dismissal_risk && t(' هناك خطر فصل يحتاج قرار مجلس الكلية.')}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle
              action={
                <Link to="/student/plans" className="text-xs font-bold text-brand-700 hover:underline">
                  {t('كل الخطط')}
                </Link>
              }
            >
              {t('آخر الخطط الدراسية')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentPlans.length === 0 ? (
              <EmptyState
                title={t('لا توجد خطط بعد')}
                description={t('أنشئ خطة استشارية للفصل القادم من صفحة الخطط الدراسية.')}
                action={
                  <Link to="/student/plans">
                    <Button size="sm">{t('إنشاء خطة')}</Button>
                  </Link>
                }
                icon={<CalendarDays className="h-6 w-6" />}
              />
            ) : (
              <div className="space-y-2">
                {data.recentPlans.map((plan) => {
                  const status = PLAN_STATUS_LABELS[plan.status];
                  return (
                    <Link
                      key={plan.id}
                      to={`/student/plans/${plan.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 p-3 transition hover:border-brand-300 hover:bg-brand-50/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                          <CalendarDays className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-ink-900">{formatTerm(plan.term)}</p>
                          <p className="text-xs text-ink-500">
                            {t('{{n}} ساعة · {{term}}', { n: formatInt(plan.total_credits), term: formatTerm(plan.term) })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={(status?.tone as never) ?? 'neutral'}>
                          {status ? t(status.ar) : plan.status}
                        </Badge>
                        <ArrowLeft className="h-4 w-4 text-ink-400" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('التقدم نحو التخرج')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar
              value={graduation.passedCredits}
              max={graduation.requiredCredits}
              label={t('الساعات المجتازة')}
            />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">{t('المطلوب')}</dt>
                <dd className="font-bold">{t('{{n}} ساعة', { n: formatInt(graduation.requiredCredits) })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">{t('المجتاز')}</dt>
                <dd className="font-bold">{t('{{n}} ساعة', { n: formatInt(graduation.passedCredits) })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">{t('المتبقي')}</dt>
                <dd className="font-bold text-gold-700">{t('{{n}} ساعة', { n: formatInt(graduation.remainingCredits) })}</dd>
              </div>
            </dl>
            <Link to="/student/graduation">
              <Button variant="outline" size="sm" className="w-full">
                {t('تدقيق التخرج التفصيلي')}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('المقررات الحالية')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.currentCourses.length === 0 ? (
              <p className="text-sm text-ink-500">{t('لا توجد مقررات قيد الدراسة مسجلة حاليًا.')}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.currentCourses.map((course) => (
                  <div key={course.id} className="rounded-xl border border-ink-100 p-3">
                    <p className="text-xs font-mono font-bold text-brand-700">{course.course_code}</p>
                    <p className="mt-0.5 text-sm font-semibold text-ink-900">{course.name_ar}</p>
                    <p className="text-xs text-ink-500">
                      {course.name_en} · {t('{{n}} ساعة', { n: formatInt(course.credits) })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('المرشد الأكاديمي')}</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.advisor ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900">{profile.advisor.full_name}</p>
                    <p className="truncate text-xs text-ink-500">{profile.advisor.email}</p>
                  </div>
                </div>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('المكتب')}</dt>
                    <dd className="font-semibold">{profile.advisor.office_location ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t('القسم')}</dt>
                    <dd className="font-semibold">{profile.department?.name_ar ?? '—'}</dd>
                  </div>
                </dl>
                <Link to="/student/advisor">
                  <Button variant="outline" size="sm" className="w-full">
                    {t('حجز ساعة مكتبية')}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-sm text-ink-500">
                {t('لم يُسند مرشد بعد.')}
                <TriangleAlert className="mt-2 h-5 w-5 text-amber-500" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Link to="/student/eligibility" className="rounded-xl border border-ink-100 bg-surface p-4 shadow-card transition hover:border-brand-300">
          <p className="text-sm font-bold text-ink-900">{t('تحقق من أهلية مقرر')}</p>
          <p className="mt-1 text-xs text-ink-500">{t('قرار فوري مع المادة والصفحة ورقم القاعدة.')}</p>
        </Link>
        <Link to="/student/chat" className="rounded-xl border border-ink-100 bg-surface p-4 shadow-card transition hover:border-brand-300">
          <p className="text-sm font-bold text-ink-900">{t('اسأل عن اللائحة')}</p>
          <p className="mt-1 text-xs text-ink-500">{t('إجابات مستخرجة من النص الرسمي مع الاستشهاد.')}</p>
        </Link>
        <Link to="/student/what-if" className="rounded-xl border border-ink-100 bg-surface p-4 shadow-card transition hover:border-brand-300">
          <p className="text-sm font-bold text-ink-900">{t('محاكاة تغيير التخصص')}</p>
          <p className="mt-1 text-xs text-ink-500">{t('المقررات المتكافئة والمتبقية قبل القرار.')}</p>
        </Link>
      </div>
    </div>
  );
}
