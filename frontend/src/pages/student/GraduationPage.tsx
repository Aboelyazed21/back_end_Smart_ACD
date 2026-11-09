import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const [term, setTerm] = useState(currentTermValue());
  const query = useQuery({
    queryKey: ['student', 'graduation', term],
    queryFn: () => api<{ data: GraduationResult }>(`/student/graduation-audit${qs({ term })}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow="تدقيق التخرج"
        title="متطلبات التخرج"
        description="قائمة كاملة بكل متطلب غير مستوفى: الساعات، المعدل، التدريب الميداني، مشروع التخرج، المجموعات الاختيارية، والمدة النظامية."
        actions={<TermSelect value={term} onChange={setTerm} label="الفصل" className="w-48" />}
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
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="حالة التخرج"
          value={data.eligible_to_graduate ? 'مستوفى' : `${formatInt(data.missing.length)} متطلب`}
          hint={data.eligible_to_graduate ? 'كل المتطلبات مستوفاة' : 'متطلبات متبقية'}
          icon={<GraduationCap className="h-5 w-5" />}
          tone={data.eligible_to_graduate ? 'success' : 'gold'}
        />
        <StatCard
          label="الساعات المجتازة"
          value={formatInt(data.passed_credits)}
          hint={`من ${formatInt(data.required_credits)}`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard label="المعدل التراكمي" value={formatNumber(data.cgpa, 2)} icon={<Award className="h-5 w-5" />} />
        <StatCard
          label="مرتبة الشرف"
          value={data.honors ? 'مستوفية' : 'غير مستوفية'}
          hint="CGPA ≥ 3.00، ≤ 8 فصول، بلا رسوب"
          icon={<Award className="h-5 w-5" />}
          tone={data.honors ? 'gold' : 'neutral'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            action={
              <Badge tone={data.eligible_to_graduate ? 'success' : 'warning'}>
                {data.eligible_to_graduate ? 'مؤهل للتخرج' : 'غير مؤهل بعد'}
              </Badge>
            }
          >
            قرار التخرج
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProgressBar
            value={data.passed_credits}
            max={data.required_credits}
            label="التقدم في الساعات المعتمدة"
            tone={data.eligible_to_graduate ? 'success' : 'brand'}
          />
          <DecisionCard decision={data.decision} />
          <DecisionCard decision={data.honors_decision} title="مرتبة الشرف (المادة 16.4)" compact />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{formatInt(data.missing.length)} متطلب</span>}>
            المتطلبات المتبقية
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.missing.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              لا توجد متطلبات متبقية وفق البيانات الحالية. يبقى الاعتماد النهائي لمجلس الكلية.
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
                        {item.requirement} · {item.rule_code} · مادة {item.article} · ص {item.page}
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
          <CardTitle>المجموعات الاختيارية</CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>المجموعة</Th>
                  <Th>المطلوب</Th>
                  <Th>المكتسب</Th>
                  <Th>الحالة</Th>
                  <Th>إجباري ناقص</Th>
                </Tr>
              </THead>
              <TBody>
                {data.elective_pools.length === 0 ? (
                  <TableEmpty colSpan={5} message="لا توجد مجموعات اختيارية مسجلة لهذا البرنامج." />
                ) : (
                  data.elective_pools.map((pool) => (
                    <Tr key={pool.pool}>
                      <Td className="font-mono text-xs font-semibold">{pool.pool}</Td>
                      <Td>{formatInt(pool.required_credits)}</Td>
                      <Td>{formatInt(pool.earned_credits)}</Td>
                      <Td>
                        <Badge tone={pool.satisfied ? 'success' : 'warning'}>{pool.satisfied ? 'مستوفاة' : 'ناقصة'}</Badge>
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

      <Alert tone="neutral" title="تنبيه">
        التدقيق يعتمد على البيانات المسجلة في النظام. أي مقرر غير مسجل أو قيد الاستيراد لن يظهر. راجع مرشدك قبل التقديم
        النهائي للتخرج.
      </Alert>
    </div>
  );
}
