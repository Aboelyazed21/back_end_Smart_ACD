import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ClipboardCheck, Inbox, TriangleAlert, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { AdvisorDashboard } from '../../lib/types';
import { WEEKDAYS } from '../../lib/constants';
import { formatTime } from '../../lib/format';
import { ErrorState, LoadingBlock, EmptyState } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader, StatCard } from '../../components/ui/Page';

export function AdvisorDashboardPage() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['advisor', 'dashboard'],
    queryFn: () => api<{ data: AdvisorDashboard }>('/advisor/dashboard'),
  });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const data = query.data.data;

  return (
    <div>
      <PageHeader
        eyebrow={t('لوحة المرشد')}
        title={t('متابعة طلابي')}
        description={t(
          'نظرة سريعة على أعداد الطلاب، الخطط المنتظرة للمراجعة، الحالات المفتوحة، وطلبات الساعات المكتبية.',
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t('طلابي')}
          value={data.students}
          icon={<Users className="h-5 w-5" />}
          tone="brand"
          hint={t('إجمالي الطلاب المسندين')}
        />
        <StatCard
          label={t('معرضون للخطر')}
          value={data.atRisk}
          icon={<TriangleAlert className="h-5 w-5" />}
          tone="danger"
          hint={t('{{n}} حالة ملاحظة أكاديمية', { n: data.probations })}
        />
        <StatCard
          label={t('خطط بانتظار المراجعة')}
          value={data.pendingPlans}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone="gold"
          hint={t('مقدّمة أو معدّلة')}
        />
        <StatCard
          label={t('حالات مفتوحة')}
          value={data.openCases}
          icon={<Inbox className="h-5 w-5" />}
          tone="info"
          hint={t('مفتوحة أو قيد المراجعة')}
        />
        <StatCard
          label={t('طلبات ساعات مكتبية')}
          value={data.pendingOfficeHourRequests}
          icon={<CalendarClock className="h-5 w-5" />}
          tone="neutral"
          hint={t('بانتظار قرارك')}
        />
        <StatCard
          label={t('مواعيد مكتبية')}
          value={data.officeHours.length}
          icon={<CalendarClock className="h-5 w-5" />}
          tone="success"
          hint={t('نشطة وغير نشطة')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle
              action={
                <Link to="/advisor/plans" className="text-xs font-bold text-brand-700 hover:underline">
                  {t('مراجعة الخطط')}
                </Link>
              }
            >
              {t('مهام سريعة')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink to="/advisor/plans" label={t('خطط بانتظار المراجعة')} value={data.pendingPlans} />
            <QuickLink to="/advisor/escalations" label={t('حالات مفتوحة')} value={data.openCases} />
            <QuickLink to="/advisor/office-hours" label={t('طلبات ساعات مكتبية')} value={data.pendingOfficeHourRequests} />
            <QuickLink to="/advisor/at-risk" label={t('طلاب معرضون للخطر')} value={data.atRisk} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('الساعات المكتبية')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.officeHours.length === 0 ? (
              <EmptyState
                title={t('لا توجد مواعيد')}
                description={t('أضف ساعات مكتبية ليتمكن طلابك من الحجز.')}
                icon={<CalendarClock className="h-6 w-6" />}
              />
            ) : (
              <div className="space-y-2">
                {data.officeHours.slice(0, 6).map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-ink-900">{t(WEEKDAYS[slot.weekday])}</p>
                      <p className="text-xs text-ink-500">
                        {formatTime(slot.start_time)} — {formatTime(slot.end_time)} · {slot.location ?? t('المكتب')}
                      </p>
                    </div>
                    <Badge tone={slot.active === false ? 'neutral' : 'success'}>
                      {slot.active === false ? t('معطّل') : t('نشط')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickLink({ to, label, value }: { to: string; label: string; value: number }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/30"
    >
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-on-primary">
        {value}
      </span>
    </Link>
  );
}
