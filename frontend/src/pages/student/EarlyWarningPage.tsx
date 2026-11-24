import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [term, setTerm] = useState(currentTermValue());
  const query = useQuery({
    queryKey: ['student', 'early-warning', term],
    queryFn: () => api<{ data: EarlyWarningResult }>(`/student/early-warning${qs({ term })}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow={t('الإنذار المبكر')}
        title={t('مؤشرات المخاطر الأكاديمية')}
        description={t(
          'مؤشرات قابلة للتفسير تعتمد على المعدل التراكمي، المقررات الراسبة، الحضور، العبء، والإنذارات. كل مؤشر مرتبط بقاعدة ومادة.',
        )}
        actions={<TermSelect value={term} onChange={setTerm} label={t('الفصل')} className="w-48" />}
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
  const { t } = useTranslation();
  const risk = RISK_META[data.risk_level];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('مستوى الخطر')}
          value={t(risk.ar)}
          hint={t('درجة {{n}} / 100', { n: formatInt(data.risk_score) })}
          icon={<Activity className="h-5 w-5" />}
          tone={data.risk_level === 'HIGH' ? 'danger' : data.risk_level === 'MEDIUM' ? 'gold' : 'success'}
        />
        <StatCard label={t('المعدل التراكمي')} value={formatNumber(data.cgpa, 2)} icon={<ArrowUpRight className="h-5 w-5" />} />
        <StatCard
          label={t('العبء الحالي')}
          value={`${formatInt(data.current_load)} / ${formatInt(data.max_load)}`}
          hint={t('ساعة معتمدة')}
          icon={<BookX className="h-5 w-5" />}
          tone={data.current_load > data.max_load ? 'danger' : 'info'}
        />
        <StatCard
          label={t('المقررات الراسبة')}
          value={formatInt(data.failed_course_codes.length)}
          hint={data.failed_course_codes.slice(0, 4).join(' · ') || t('لا يوجد')}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={data.failed_course_codes.length ? 'danger' : 'success'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle action={<Badge tone={risk.tone}>{t(risk.ar)}</Badge>}>{t('المؤشرات المرصودة')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.indicators.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                {t('لا توجد مؤشرات خطر حالية. استمر في المتابعة الدورية.')}
              </div>
            ) : (
              <div className="space-y-2">
                {data.indicators.map((indicator) => (
                  <div key={indicator.code} className="rounded-xl border border-ink-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">{indicator.message_ar}</p>
                      <Badge tone={indicator.severity === 'high' ? 'danger' : indicator.severity === 'medium' ? 'warning' : 'neutral'}>
                        {indicator.severity === 'high'
                          ? t('مرتفع')
                          : indicator.severity === 'medium'
                            ? t('متوسط')
                            : t('منخفض')}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink-500">{indicator.message_en}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-400">
                      {indicator.rule_code} · {t('مادة {{n}}', { n: indicator.article })} · {t('ص {{n}}', { n: indicator.page })}
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
              <CardTitle>{t('درجة الخطر')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar
                value={data.risk_score}
                max={100}
                label={t('نسبة الخطورة')}
                tone={data.risk_level === 'HIGH' ? 'danger' : data.risk_level === 'MEDIUM' ? 'gold' : 'success'}
              />
              <div className="mt-4 space-y-2 text-xs text-ink-600">
                <p className="flex justify-between">
                  <span>{t('ملاحظة أكاديمية')}</span>
                  <Badge tone={data.probation ? 'danger' : 'success'}>{data.probation ? t('نعم') : t('لا')}</Badge>
                </p>
                <p className="flex justify-between">
                  <span>{t('خطر الفصل')}</span>
                  <Badge tone={data.dismissal_risk ? 'danger' : 'success'}>{data.dismissal_risk ? t('نعم') : t('لا')}</Badge>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('إجراءات مقترحة')}</CardTitle>
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

      <Alert tone="neutral" title={t('هذه المؤشرات استشارية')}>
        {t(
          'لا تُصدر إنذارات رسمية من هذه الصفحة. الإنذار الأكاديمي وإجراءات الفصل من اختصاص مجلس الكلية وفق اللائحة.',
        )}
      </Alert>
    </div>
  );
}
