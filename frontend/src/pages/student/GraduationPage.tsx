import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Award, CheckCircle2, GraduationCap, XCircle } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { GraduationResult } from '../../lib/types';
import { formatInt, formatNumber, currentTermValue } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DecisionCard } from '../../components/ui/Decision';
import { PageHeader, ProgressBar, StatCard } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { TermSelect } from '../../components/ui/PaginationBar';

export function GraduationPage() {
  const { t } = useTranslation();
  const [term, setTerm] = useState(currentTermValue());
  const query = useQuery({
    queryKey: ['student', 'graduation', term],
    queryFn: () => api<{ data: GraduationResult }>(`/student/graduation-audit${qs({ term })}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow={t('تدقيق التخرج')}
        title={t('متطلبات التخرج')}
        description={t(
          'قائمة كاملة بكل متطلب غير مستوفى: الساعات، المعدل، التدريب الميداني، مشروع التخرج، المجموعات الاختيارية، والمدة النظامية.',
        )}
        actions={<TermSelect value={term} onChange={setTerm} label={t('الفصل')} className="w-48" />}
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError || !query.data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <GraduationContent data={query.data.data} />
      )}
    </div>
  );
}

function GraduationContent({ data }: { data: GraduationResult }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('حالة التخرج')}
          value={data.eligible_to_graduate ? t('مستوفى') : t('{{n}} متطلب', { n: formatInt(data.missing.length) })}
          hint={data.eligible_to_graduate ? t('كل المتطلبات مستوفاة') : t('متطلبات متبقية')}
          icon={<GraduationCap className="h-5 w-5" />}
          tone={data.eligible_to_graduate ? 'success' : 'gold'}
        />
        <StatCard
          label={t('الساعات المجتازة')}
          value={formatInt(data.passed_credits)}
          hint={t('من {{n}}', { n: formatInt(data.required_credits) })}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard label={t('المعدل التراكمي')} value={formatNumber(data.cgpa, 2)} icon={<Award className="h-5 w-5" />} />
        <StatCard
          label={t('مرتبة الشرف')}
          value={data.honors ? t('مستوفية') : t('غير مستوفية')}
          hint={t('CGPA ≥ 3.00، ≤ 8 فصول، بلا رسوب')}
          icon={<Award className="h-5 w-5" />}
          tone={data.honors ? 'gold' : 'neutral'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            action={
              <Badge tone={data.eligible_to_graduate ? 'success' : 'warning'}>
                {data.eligible_to_graduate ? t('مؤهل للتخرج') : t('غير مؤهل بعد')}
              </Badge>
            }
          >
            {t('قرار التخرج')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProgressBar
            value={data.passed_credits}
            max={data.required_credits}
            label={t('التقدم في الساعات المعتمدة')}
            tone={data.eligible_to_graduate ? 'success' : 'brand'}
          />
          <DecisionCard decision={data.decision} />
          <DecisionCard decision={data.honors_decision} title={t('مرتبة الشرف (المادة 16.4)')} compact />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{t('{{n}} متطلب', { n: formatInt(data.missing.length) })}</span>}>
            {t('المتطلبات المتبقية')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.missing.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              {t('لا توجد متطلبات متبقية وفق البيانات الحالية. يبقى الاعتماد النهائي لمجلس الكلية.')}
            </div>
          ) : (
            <div className="space-y-2">
              {data.missing.map((item, index) => (
                <div key={`${item.requirement}-${index}`} className="rounded-xl border border-ink-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{item.message_ar}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{item.message_en}</p>
                      <p className="mt-1 font-mono text-[11px] text-ink-400">
                        {item.requirement} · {item.rule_code} · {t('مادة {{n}}', { n: item.article })} · {t('ص {{n}}', { n: item.page })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.anomaly_ids?.map((anomaly) => (
                        <Badge key={anomaly} tone="warning" className="font-mono text-[10px]">
                          {anomaly}
                        </Badge>
                      ))}
                      <XCircle className="h-4 w-4 text-danger" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('المجموعات الاختيارية')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>{t('المجموعة')}</Th>
                  <Th>{t('المطلوب')}</Th>
                  <Th>{t('المكتسب')}</Th>
                  <Th>{t('الحالة')}</Th>
                  <Th>{t('إجباري ناقص')}</Th>
                </Tr>
              </THead>
              <TBody>
                {data.elective_pools.length === 0 ? (
                  <TableEmpty colSpan={5} message={t('لا توجد مجموعات اختيارية مسجلة لهذا البرنامج.')} />
                ) : (
                  data.elective_pools.map((pool) => (
                    <Tr key={pool.pool}>
                      <Td className="font-mono text-xs font-semibold">{pool.pool}</Td>
                      <Td>{formatInt(pool.required_credits)}</Td>
                      <Td>{formatInt(pool.earned_credits)}</Td>
                      <Td>
                        <Badge tone={pool.satisfied ? 'success' : 'warning'}>
                          {pool.satisfied ? t('مستوفاة') : t('ناقصة')}
                        </Badge>
                      </Td>
                      <Td className="text-xs">{pool.mandatory_missing.join(', ') || '—'}</Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Alert tone="neutral" title={t('تنبيه')}>
        {t(
          'التدقيق يعتمد على البيانات المسجلة في النظام. أي مقرر غير مسجل أو قيد الاستيراد لن يظهر. راجع مرشدك قبل التقديم النهائي للتخرج.',
        )}
      </Alert>
    </div>
  );
}
