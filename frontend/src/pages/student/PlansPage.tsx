import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ListChecks, Plus, Sparkles } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { GeneratedPlan, StudyPlanListRow } from '../../lib/types';
import { PLAN_STATUS_LABELS } from '../../lib/constants';
import { formatDate, formatInt, formatTerm, currentTermValue, termOptions } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Checkbox, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { useToast } from '../../components/ui/Toast';

const DAY_OPTIONS = [
  { value: 'sat', label: 'السبت' },
  { value: 'sun', label: 'الأحد' },
  { value: 'mon', label: 'الاثنين' },
  { value: 'tue', label: 'الثلاثاء' },
  { value: 'wed', label: 'الأربعاء' },
  { value: 'thu', label: 'الخميس' },
];

export function PlansPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(currentTermValue());
  const [maxCredits, setMaxCredits] = useState('18');
  const [planningSlot, setPlanningSlot] = useState('');
  const [avoidDays, setAvoidDays] = useState<string[]>([]);
  const [compressDays, setCompressDays] = useState(false);
  const [preferMorning, setPreferMorning] = useState(false);

  const plans = useQuery({
    queryKey: ['student', 'plans'],
    queryFn: () => api<{ data: StudyPlanListRow[] }>('/student/plans'),
  });

  const generate = useMutation({
    mutationFn: () =>
      api<{ data: GeneratedPlan }>('/student/plans', {
        method: 'POST',
        body: {
          term,
          ...(maxCredits ? { maxCredits: Number(maxCredits) } : {}),
          ...(planningSlot ? { planningSlot } : {}),
          ...(avoidDays.length || compressDays || preferMorning
            ? {
                preferences: {
                  ...(avoidDays.length ? { avoid_days: avoidDays } : {}),
                  ...(compressDays ? { compress_days: true } : {}),
                  ...(preferMorning ? { prefer_morning: true } : {}),
                },
              }
            : {}),
        },
      }),
    onSuccess: async (result) => {
      toast.success('تم إنشاء مسودة الخطة', `${formatInt(result.data.total_credits)} ساعة معتمدة — بانتظار تقديمها للمرشد.`);
      await queryClient.invalidateQueries({ queryKey: ['student', 'plans'] });
      setOpen(false);
      navigate(`/student/plans/${result.data.id}`);
    },
    onError: (error) => toast.error('تعذر إنشاء الخطة', errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        eyebrow="الخطط الدراسية"
        title="خطط الفصل الاستشارية"
        description="ينشئ محرك القواعد مسودة خطة (DRAFT) لا تتضمن إلا المقررات المؤهلة. تقديم الخطة للمرشد لا يعني تسجيلها."
        actions={
          <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
            إنشاء خطة جديدة
          </Button>
        }
      />

      <Alert tone="info" className="mb-4" title="ما معنى مسودة؟" icon={<Sparkles className="h-5 w-5" />}>
        الخطة استشارية فقط. لا يوجد في النظام أي نقطة تسجيل مقررات. يعتمد المرشد الخطة أو يعدّلها، ثم تكتمل إجراءات
        التسجيل الرسمية خارج المنصة.
      </Alert>

      {plans.isLoading ? (
        <LoadingBlock />
      ) : plans.isError ? (
        <ErrorState message={errorMessage(plans.error)} onRetry={() => void plans.refetch()} />
      ) : plans.data?.data.length === 0 ? (
        <EmptyState
          title="لا توجد خطط دراسية"
          description="ابدأ بإنشاء مسودة خطة للفصل القادم. سيراعي النظام المتطلبات والعبء الأكاديمي."
          icon={<ListChecks className="h-6 w-6" />}
          action={
            <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
              إنشاء خطة جديدة
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.data?.data.map((plan) => {
            const status = PLAN_STATUS_LABELS[plan.status];
            return (
              <Link key={plan.id} to={`/student/plans/${plan.id}`}>
                <Card className="h-full p-5 transition hover:border-brand-300 hover:shadow-float">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                        <CalendarDays className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-display text-sm font-bold text-ink-900">{formatTerm(plan.term)}</p>
                        <p className="text-xs text-ink-500">{formatInt(plan.total_credits)} ساعة</p>
                      </div>
                    </div>
                    <Badge tone={(status?.tone as never) ?? 'neutral'}>{status?.ar ?? plan.status}</Badge>
                  </div>
                  <div className="mt-4 space-y-1 text-xs text-ink-500">
                    <p>أُنشئت: {formatDate(plan.created_at, true)}</p>
                    {plan.planning_slot && <p>خانة التخطيط: {plan.planning_slot}</p>}
                    {plan.feedback && <p className="line-clamp-2 text-ink-600">ملاحظة المرشد: {plan.feedback}</p>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="إنشاء مسودة خطة"
        description="حدد الفصل والحد الأقصى للساعات وتفضيلات الجدول. سيتم استبعاد أي مقرر غير مؤهل تلقائيًا."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => generate.mutate()} loading={generate.isPending} icon={<Sparkles className="h-4 w-4" />}>
              توليد المسودة
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {generate.isError && <Alert tone="danger">{errorMessage(generate.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="الفصل الدراسي"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              options={termOptions(6)}
            />
            <Input
              label="الحد الأقصى للساعات"
              type="number"
              min={0}
              max={21}
              value={maxCredits}
              onChange={(event) => setMaxCredits(event.target.value)}
              hint="اتركه فارغًا ليُحدد النظام الحد وفق اللائحة."
            />
            <Select
              label="خانة التخطيط (اختياري)"
              value={planningSlot}
              onChange={(event) => setPlanningSlot(event.target.value)}
              placeholder="تلقائي"
              options={[
                { value: '1-1', label: 'المستوى 1 — خريف' },
                { value: '1-2', label: 'المستوى 1 — ربيع' },
                { value: '2-1', label: 'المستوى 2 — خريف' },
                { value: '2-2', label: 'المستوى 2 — ربيع' },
                { value: '3-1', label: 'المستوى 3 — خريف' },
                { value: '3-2', label: 'المستوى 3 — ربيع' },
                { value: '4-1', label: 'المستوى 4 — خريف' },
                { value: '4-2', label: 'المستوى 4 — ربيع' },
              ]}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink-800">أيام يُفضّل تجنّبها</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DAY_OPTIONS.map((day) => (
                <Checkbox
                  key={day.value}
                  label={day.label}
                  checked={avoidDays.includes(day.value)}
                  onChange={(event) =>
                    setAvoidDays((current) =>
                      event.target.checked
                        ? [...current, day.value]
                        : current.filter((value) => value !== day.value),
                    )
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <Checkbox
              label="ضغط الأيام (أقل عدد أيام)"
              checked={compressDays}
              onChange={(event) => setCompressDays(event.target.checked)}
            />
            <Checkbox
              label="تفضيل المحاضرات الصباحية"
              checked={preferMorning}
              onChange={(event) => setPreferMorning(event.target.checked)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
