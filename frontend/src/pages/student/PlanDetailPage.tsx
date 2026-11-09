import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, FileText, Send, ShieldCheck } from 'lucide-react';
import { api, apiBlob, errorMessage } from '../../lib/api';
import type { StudyPlanDetail } from '../../lib/types';
import { PLAN_STATUS_LABELS } from '../../lib/constants';
import { formatDate, formatInt, formatTerm } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { KeyValue, PageHeader } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { RuleCitation } from '../../components/ui/Decision';

export function PlanDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  const plan = useQuery({
    queryKey: ['student', 'plan', id],
    queryFn: () => api<{ data: StudyPlanDetail }>(`/student/plans/${id}`),
    enabled: Boolean(id),
  });

  const submit = useMutation({
    mutationFn: () => api(`/student/plans/${id}/submit`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('تم تقديم الخطة', 'ستظهر للمرشد الأكاديمي لمراجعتها.');
      await queryClient.invalidateQueries({ queryKey: ['student', 'plan', id] });
      await queryClient.invalidateQueries({ queryKey: ['student', 'plans'] });
    },
    onError: (error) => toast.error('تعذر تقديم الخطة', errorMessage(error)),
  });

  const download = async () => {
    try {
      const blob = await apiBlob(`/student/plans/${id}/export`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `advising-plan-${id.slice(0, 8)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل الخطة', 'الملف موقّع برمز QR للتحقق.');
    } catch (error) {
      toast.error('تعذر تصدير الخطة', errorMessage(error));
    }
  };

  if (plan.isLoading) return <LoadingBlock label="جارٍ تحميل الخطة…" />;
  if (plan.isError || !plan.data) {
    return <ErrorState message={errorMessage(plan.error)} onRetry={() => void plan.refetch()} />;
  }

  const { plan: record, items } = plan.data.data;
  const status = PLAN_STATUS_LABELS[record.status];
  const total = items.reduce((sum, item) => sum + item.credits, 0);
  const loadDecision = record.engine_payload?.load_decision as
    | { reason_ar: string; rule_code: string; article: string; page: string; status: string }
    | undefined;
  const excluded = (record.engine_payload?.excluded as Array<{ course_code?: string; reason_ar?: string; rule_code?: string; status?: string }>) ?? [];

  return (
    <div>
      <Link to="/student/plans" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowRight className="h-4 w-4" /> كل الخطط
      </Link>
      <PageHeader
        eyebrow="خطة استشارية"
        title={formatTerm(record.term)}
        description="مسودة خطة مولّدة من محرك القواعد. راجع كل مقرر ومرجعه قبل التقديم للمرشد."
        actions={
          <>
            <Button variant="outline" onClick={() => void download()} icon={<Download className="h-4 w-4" />}>
              تصدير PDF
            </Button>
            {record.status === 'DRAFT' && (
              <Button
                onClick={() => submit.mutate()}
                loading={submit.isPending}
                icon={<Send className="h-4 w-4" />}
              >
                تقديم للمرشد
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle action={<Badge tone={(status?.tone as never) ?? 'neutral'}>{status?.ar ?? record.status}</Badge>}>
              بيانات الخطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <KeyValue label="الفصل" value={formatTerm(record.term)} />
              <KeyValue label="إجمالي الساعات" value={`${formatInt(total)} ساعة`} />
              <KeyValue label="تاريخ الإنشاء" value={formatDate(record.created_at, true)} />
              <KeyValue label="الخانة" value={record.planning_slot ?? 'تلقائي'} />
              <KeyValue label="إصدار المحرك" value={<span className="font-mono text-xs">{record.engine_version}</span>} />
              <KeyValue label="مراجعة المرشد" value={record.reviewed_at ? formatDate(record.reviewed_at, true) : 'لم تُراجع بعد'} />
            </dl>
            {record.feedback && (
              <Alert tone="info" className="mt-4" title="ملاحظات المرشد">
                {record.feedback}
              </Alert>
            )}
            {record.load_flags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {record.load_flags.map((flag) => (
                  <Badge key={flag} tone="warning">
                    {flag}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>قرار العبء</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadDecision ? (
              <>
                <p className="text-sm leading-6 text-ink-700">{loadDecision.reason_ar}</p>
                <RuleCitation ruleCode={loadDecision.rule_code} article={loadDecision.article} page={loadDecision.page} />
              </>
            ) : (
              <p className="text-sm text-ink-500">لا يوجد قرار عبء محفوظ لهذه الخطة.</p>
            )}
            <Alert tone="neutral" icon={<ShieldCheck className="h-4 w-4" />}>
              هذه الخطة لا تُسجل المقررات. التقديم يعني طلب مراجعة أكاديمية فقط.
            </Alert>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{formatInt(items.length)} مقرر</span>}>
            مقررات الخطة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>#</Th>
                  <Th>المقرر</Th>
                  <Th>الساعات</Th>
                  <Th>الحالة</Th>
                  <Th>المرجع</Th>
                  <Th>الأسباب</Th>
                </Tr>
              </THead>
              <TBody>
                {items.length === 0 ? (
                  <TableEmpty colSpan={6} message="لم يتضمن المحرك أي مقرر مؤهل لهذه الخطة." />
                ) : (
                  items.map((item) => (
                    <Tr key={item.id}>
                      <Td className="text-xs text-ink-400">{item.position + 1}</Td>
                      <Td>
                        <p className="font-mono text-xs font-bold text-brand-700">{item.course_code}</p>
                        <p className="text-sm font-semibold text-ink-900">{item.name_ar}</p>
                        <p className="text-xs text-ink-500">{item.name_en}</p>
                      </Td>
                      <Td className="tabular-nums">{formatInt(item.credits)}</Td>
                      <Td>
                        <Badge tone="success">{item.eligibility_status}</Badge>
                      </Td>
                      <Td>
                        <RuleCitation ruleCode={item.rule_code} article={item.article} page={item.page} />
                      </Td>
                      <Td className="max-w-xs">
                        <p className="text-xs leading-5 text-ink-600">{item.reason_ar}</p>
                        {item.anomaly_ids.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.anomaly_ids.map((anomaly) => (
                              <Badge key={anomaly} tone="warning" className="font-mono text-[10px]">
                                {anomaly}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      {excluded.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>مقررات استُبعدت</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {excluded.map((item, index) => (
                <div key={`${item.course_code ?? index}`} className="rounded-xl border border-ink-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-ink-700">{item.course_code}</span>
                    <Badge tone={item.status === 'NOT_ELIGIBLE' ? 'danger' : 'warning'}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-600">{item.reason_ar}</p>
                  {item.rule_code && <p className="mt-1 text-[11px] font-mono text-ink-400">{item.rule_code}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-ink-100 bg-white p-4 text-xs text-ink-500">
        <span className="inline-flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-600" />
          نسخة PDF تحمل رمز QR موقّعًا للتحقق من سلامة المستند.
        </span>
        <span className="font-mono">{record.id.slice(0, 8)}</span>
      </div>
    </div>
  );
}
