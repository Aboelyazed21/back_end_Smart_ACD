import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, ExternalLink, PencilLine, XCircle } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { StudyPlanListRow } from '../../lib/types';
import { PROGRAM_LABELS } from '../../lib/constants';
import { formatDate, formatInt, formatTerm } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

type Decision = 'APPROVED' | 'REJECTED' | 'MODIFIED';

const DECISION_META: Record<Decision, { label: string; description: string }> = {
  APPROVED: { label: 'اعتماد الخطة', description: 'الخطة متوافقة مع اللائحة وتُعتمد استشاريًا.' },
  MODIFIED: { label: 'طلب تعديل', description: 'تحتاج الخطة تعديلات قبل الاعتماد.' },
  REJECTED: { label: 'رفض الخطة', description: 'الخطة غير قابلة للاعتماد كما هي.' },
};

export function AdvisorPlansPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<StudyPlanListRow | null>(null);
  const [decision, setDecision] = useState<Decision>('APPROVED');
  const [feedback, setFeedback] = useState('');

  const query = useQuery({
    queryKey: ['advisor', 'plans', status],
    queryFn: () =>
      api<{ data: StudyPlanListRow[] }>(`/advisor/plans${qs({ status: status || undefined })}`),
  });

  const review = useMutation({
    mutationFn: () =>
      api(`/advisor/plans/${selected?.id}/review`, {
        method: 'PATCH',
        body: { decision, feedback: feedback.trim() },
      }),
    onSuccess: async () => {
      toast.success('تم حفظ قرار المراجعة', DECISION_META[decision].label);
      setSelected(null);
      setFeedback('');
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'plans'] });
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'dashboard'] });
    },
    onError: (error) => toast.error('تعذر حفظ المراجعة', errorMessage(error)),
  });

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="مراجعة الخطط"
        title="الخطط المنتظرة للمراجعة"
        description="راجع الخطط المقدّمة من طلابك. الاعتماد استشاري ولا يعني تسجيل المقررات. كل قرار يُسجّل في سجل التدقيق."
        actions={
          <Select
            label="الحالة"
            className="w-44"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: '', label: 'بانتظار المراجعة' },
              { value: 'SUBMITTED', label: 'مقدّمة' },
              { value: 'MODIFIED', label: 'معدّلة' },
              { value: 'APPROVED', label: 'معتمدة' },
              { value: 'REJECTED', label: 'مرفوضة' },
              { value: 'DRAFT', label: 'مسودة' },
            ]}
          />
        }
      />

      <Alert tone="info" className="mb-4" title="سياسة المراجعة">
        لا يمكن اعتماد خطة بدون ملاحظة مكتوبة (3 أحرف على الأقل). سبب الاعتماد أو الرفض يساعد الطالب واللجنة الأكاديمية.
      </Alert>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="لا توجد خطط بانتظار المراجعة"
          description="ستظهر الخطط هنا بعد تقديم الطلاب لها."
          icon={<ClipboardCheck className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>الطالب</Th>
                    <Th>البرنامج</Th>
                    <Th>الفصل</Th>
                    <Th>الساعات</Th>
                    <Th>الحالة</Th>
                    <Th>تاريخ التقديم</Th>
                    <Th>إجراءات</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((plan) => (
                    <Tr key={plan.id}>
                      <Td>
                        <p className="text-sm font-bold text-ink-900">{plan.full_name ?? '—'}</p>
                        <p className="font-mono text-xs text-ink-500">{plan.student_code}</p>
                      </Td>
                      <Td>
                        <Badge tone="brand">{plan.program ? PROGRAM_LABELS[plan.program].short : '—'}</Badge>
                      </Td>
                      <Td className="text-xs">{formatTerm(plan.term)}</Td>
                      <Td className="tabular-nums">{formatInt(plan.total_credits)}</Td>
                      <Td>
                        <Badge tone={plan.status === 'SUBMITTED' ? 'info' : 'warning'}>{plan.status}</Badge>
                      </Td>
                      <Td className="text-xs">{plan.submitted_at ? formatDate(plan.submitted_at, true) : '—'}</Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelected(plan);
                              setDecision('APPROVED');
                              setFeedback('');
                            }}
                            icon={<ClipboardCheck className="h-4 w-4" />}
                          >
                            مراجعة
                          </Button>
                          {plan.student_id && (
                            <Link to={`/advisor/students/${plan.student_id}`}>
                              <Button size="sm" variant="ghost" icon={<ExternalLink className="h-4 w-4" />}>
                                ملف الطالب
                              </Button>
                            </Link>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="مراجعة الخطة"
        description={
          selected
            ? `${selected.full_name ?? ''} · ${formatTerm(selected.term)} · ${formatInt(selected.total_credits)} ساعة`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => review.mutate()}
              loading={review.isPending}
              disabled={feedback.trim().length < 3}
              variant={decision === 'REJECTED' ? 'danger' : decision === 'MODIFIED' ? 'gold' : 'primary'}
            >
              {DECISION_META[decision].label}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {review.isError && <Alert tone="danger">{errorMessage(review.error)}</Alert>}

          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(DECISION_META) as Decision[]).map((key) => {
              const meta = DECISION_META[key];
              const active = decision === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDecision(key)}
                  className={`rounded-xl border p-3 text-start transition ${
                    active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-300' : 'border-ink-200 hover:border-brand-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                    {key === 'APPROVED' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : key === 'REJECTED' ? (
                      <XCircle className="h-4 w-4 text-danger" />
                    ) : (
                      <PencilLine className="h-4 w-4 text-gold-600" />
                    )}
                    {meta.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-ink-500">{meta.description}</span>
                </button>
              );
            })}
          </div>

          <Textarea
            label="ملاحظات المرشد"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            maxLength={2000}
            required
            placeholder="اشرح سبب القرار، وأي تعديل مطلوب على المقررات أو العبء…"
            hint="3 أحرف على الأقل. تُرسل الملاحظة للطالب وتُحفظ في سجل المراجعة."
          />

          {selected?.feedback && (
            <Alert tone="neutral" title="ملاحظات سابقة">
              {selected.feedback}
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  );
}
