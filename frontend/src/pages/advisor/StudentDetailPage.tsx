import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, MessageSquarePlus, ShieldCheck } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type {
  AdvisorStudentDetail,
  AdvisingNote,
  BulkEligibility,
  EarlyWarningResult,
  Enrollment,
  GraduationResult,
  StandingResult,
  StudyPlanListRow,
} from '../../lib/types';
import { GRADE_STATUS_LABELS, PLAN_STATUS_LABELS, PROGRAM_LABELS } from '../../lib/constants';
import { currentTermValue, formatDate, formatInt, formatNumber, formatTerm } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DecisionCard } from '../../components/ui/Decision';
import { Textarea } from '../../components/ui/Input';
import { KeyValue, PageHeader, ProgressBar } from '../../components/ui/Page';
import { Select } from '../../components/ui/Input';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/format';

type Tab = 'overview' | 'eligibility' | 'standing' | 'warning' | 'graduation' | 'notes';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'eligibility', label: 'أهلية التسجيل' },
  { id: 'standing', label: 'الموقف الأكاديمي' },
  { id: 'warning', label: 'الإنذار المبكر' },
  { id: 'graduation', label: 'تدقيق التخرج' },
  { id: 'notes', label: 'ملاحظات الإرشاد' },
];

export function AdvisorStudentDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [term, setTerm] = useState(currentTermValue());

  const query = useQuery({
    queryKey: ['advisor', 'student', id],
    queryFn: () => api<{ data: AdvisorStudentDetail }>(`/advisor/students/${id}`),
    enabled: Boolean(id),
  });

  if (query.isLoading) return <LoadingBlock label="جارٍ تحميل ملف الطالب…" />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { profile, enrollments, latestStanding, plans } = query.data.data;
  const student = profile.student;

  return (
    <div>
      <Link
        to="/advisor/students"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowRight className="h-4 w-4" /> كل الطلاب
      </Link>

      <PageHeader
        eyebrow={`ملف الطالب · ${student.studentCode}`}
        title={`ملف الطالب ${student.studentCode}`}
        description={`${PROGRAM_LABELS[student.program].ar} — المستوى ${student.level}. كل التقييمات استشارية ومبنية على اللائحة.`}
        actions={
          <Select
            label="الفصل"
            className="w-48"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            options={termSelectOptions(term)}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-ink-500">المعدل التراكمي</p>
          <p className={cn('mt-1 font-display text-2xl font-extrabold', student.cgpa < 2 ? 'text-danger' : 'text-ink-950')}>
            {formatNumber(student.cgpa, 2)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {latestStanding?.term ? formatTerm(latestStanding.term) : '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">الساعات المجتازة</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-ink-950">{formatInt(student.passedCredits)}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">منها {formatInt(student.transferCredits)} محوّلة</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">الفصول النظامية</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-ink-950">
            {formatInt(student.regularSemestersCompleted)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">من 16 كحد أقصى</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">الإنذارات</p>
          <p
            className={cn(
              'mt-1 font-display text-2xl font-extrabold',
              (latestStanding?.total_warnings ?? 0) > 0 ? 'text-danger' : 'text-emerald-700',
            )}
          >
            {formatInt(latestStanding?.total_warnings ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {formatInt(latestStanding?.consecutive_warnings ?? 0)} إنذار متتالٍ
          </p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-ink-100 bg-white p-1 shadow-card">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
              tab === item.id ? 'bg-brand-700 text-white shadow-sm' : 'text-ink-600 hover:bg-ink-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab profile={profile} enrollments={enrollments} plans={plans} />
      )}
      {tab === 'eligibility' && <EligibilityTab studentId={id} term={term} />}
      {tab === 'standing' && <StandingTab studentId={id} term={term} />}
      {tab === 'warning' && <WarningTab studentId={id} term={term} />}
      {tab === 'graduation' && <GraduationTab studentId={id} term={term} />}
      {tab === 'notes' && <NotesTab studentId={id} />}
    </div>
  );
}

function termSelectOptions(current: string) {
  const options = termOptionsList(8);
  if (!options.some((option) => option.value === current)) {
    options.unshift({ value: current, label: formatTerm(current) });
  }
  return options;
}

function termOptionsList(count: number) {
  const base = currentTermValue();
  const match = /^(\d{4})-(\d{4})-(fall|spring|summer)$/.exec(base);
  if (!match) return [{ value: base, label: formatTerm(base) }];
  const order = ['fall', 'spring', 'summer'] as const;
  let year = Number(match[1]);
  let index = order.indexOf(match[3] as (typeof order)[number]);
  const options: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const value = `${year}-${year + 1}-${order[index]}`;
    options.push({ value, label: formatTerm(value) });
    index -= 1;
    if (index < 0) {
      index = order.length - 1;
      year -= 1;
    }
  }
  return options;
}

function OverviewTab({
  profile,
  enrollments,
  plans,
}: {
  profile: AdvisorStudentDetail['profile'];
  enrollments: Enrollment[];
  plans: StudyPlanListRow[];
}) {
  const student = profile.student;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>بيانات الطالب</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <KeyValue label="رقم الطالب" value={<span className="font-mono">{student.studentCode}</span>} />
            <KeyValue label="البرنامج" value={PROGRAM_LABELS[student.program].ar} />
            <KeyValue label="المستوى" value={formatInt(student.level)} />
            <KeyValue label="فصل القبول" value={student.admissionTerm ? formatTerm(student.admissionTerm) : '—'} />
            <KeyValue label="القسم" value={profile.department?.name_ar ?? '—'} />
            <KeyValue label="المعدل" value={formatNumber(student.cgpa, 2)} />
            <KeyValue label="الساعات المجتازة" value={formatInt(student.passedCredits)} />
            <KeyValue label="الساعات المحوّلة" value={formatInt(student.transferCredits)} />
          </dl>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{formatInt(plans.length)} خطة</span>}>
            الخطط الدراسية
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <EmptyState title="لا توجد خطط" description="لم يولّد الطالب أي مسودة خطة بعد." />
          ) : (
            <div className="space-y-2">
              {plans.map((plan) => {
                const status = PLAN_STATUS_LABELS[plan.status];
                return (
                  <div
                    key={plan.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 p-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-ink-900">{formatTerm(plan.term)}</p>
                      <p className="text-xs text-ink-500">
                        {formatInt(plan.total_credits)} ساعة · {formatDate(plan.created_at)}
                      </p>
                    </div>
                    <Badge tone={(status?.tone as never) ?? 'neutral'}>{status?.ar ?? plan.status}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{formatInt(enrollments.length)} محاولة</span>}>
            السجل الأكاديمي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>المقرر</Th>
                  <Th>الفصل</Th>
                  <Th>الساعات</Th>
                  <Th>التقدير</Th>
                  <Th>النسبة</Th>
                  <Th>الحالة</Th>
                  <Th>المحاولة</Th>
                </Tr>
              </THead>
              <TBody>
                {enrollments.length === 0 ? (
                  <TableEmpty colSpan={7} message="لا توجد مقررات مسجلة." />
                ) : (
                  enrollments.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <p className="font-mono text-xs font-bold text-brand-700">{row.courseCode}</p>
                        <p className="text-sm font-semibold text-ink-900">{row.nameAr}</p>
                      </Td>
                      <Td className="text-xs">{formatTerm(row.term)}</Td>
                      <Td>{formatInt(row.credits)}</Td>
                      <Td className="font-mono font-bold">{row.gradeLetter ?? '—'}</Td>
                      <Td className="tabular-nums">
                        {row.percentage === null ? '—' : formatNumber(row.percentage, 1)}
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            row.status === 'passed'
                              ? 'success'
                              : row.status === 'failed' || row.status === 'absent'
                                ? 'danger'
                                : row.status === 'in_progress'
                                  ? 'info'
                                  : 'neutral'
                          }
                        >
                          {GRADE_STATUS_LABELS[row.status] ?? row.status}
                        </Badge>
                      </Td>
                      <Td className="text-xs">{row.attemptNo}</Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  );
}

function EligibilityTab({ studentId, term }: { studentId: string; term: string }) {
  const query = useQuery({
    queryKey: ['advisor', 'student', studentId, 'eligibility', term],
    queryFn: () => api<{ data: BulkEligibility }>(`/advisor/students/${studentId}/eligibility${qs({ term })}`),
  });

  if (query.isLoading) return <LoadingBlock label="جارٍ تطبيق قواعد الأهلية…" />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data.data;
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>قرار العبء الأكاديمي</CardTitle>
        </CardHeader>
        <CardContent>
          <DecisionCard decision={data.loadDecision} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{formatInt(data.decisions.length)} قرار</span>}>
            قرارات المقررات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.decisions.length === 0 ? (
            <EmptyState title="لا توجد قرارات" description="لا توجد مقررات مرشحة لهذا الفصل." />
          ) : (
            <div className="grid gap-2">
              {data.decisions.map((decision, index) => (
                <DecisionCard
                  key={`${decision.course_code ?? 'x'}-${decision.rule_code}-${index}`}
                  decision={decision}
                  title={decision.course_code ?? 'قرار'}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StandingTab({ studentId, term }: { studentId: string; term: string }) {
  const query = useQuery({
    queryKey: ['advisor', 'student', studentId, 'standing', term],
    queryFn: () => api<{ data: StandingResult }>(`/advisor/students/${studentId}/standing${qs({ term })}`),
  });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-ink-500">CGPA</p>
          <p className="mt-1 font-display text-2xl font-extrabold">{formatNumber(data.cgpa, 2)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">SGPA</p>
          <p className="mt-1 font-display text-2xl font-extrabold">{formatNumber(data.sgpa, 2)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">المستوى</p>
          <p className="mt-1 font-display text-2xl font-extrabold">{formatInt(data.level)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">النتيجة</p>
          <p className="mt-1 text-sm font-bold text-ink-900">{data.classification}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>القرارات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DecisionCard decision={data.decision} title="الملاحظة الأكاديمية" />
          {data.dismissal_decision && <DecisionCard decision={data.dismissal_decision} title="خطر الفصل" />}
          <DecisionCard decision={data.suspension_decision} title="حدود الإيقاف" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <ProgressBar
            value={data.regular_semesters_completed}
            max={data.max_regular_semesters}
            label="الفصول النظامية المستهلكة"
            tone={data.regular_semesters_completed >= data.max_regular_semesters ? 'danger' : 'brand'}
          />
          <div className="flex flex-wrap gap-2">
            <Badge tone={data.probation ? 'danger' : 'success'}>{data.probation ? 'ملاحظة أكاديمية' : 'لا ملاحظة'}</Badge>
            <Badge tone={data.dismissal_risk ? 'danger' : 'success'}>
              {data.dismissal_risk ? 'خطر فصل' : 'لا خطر فصل'}
            </Badge>
            <Badge tone={data.final_chance ? 'warning' : 'neutral'}>{data.final_chance ? 'فرصة أخيرة' : '—'}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WarningTab({ studentId, term }: { studentId: string; term: string }) {
  const query = useQuery({
    queryKey: ['advisor', 'student', studentId, 'warning', term],
    queryFn: () => api<{ data: EarlyWarningResult }>(`/advisor/students/${studentId}/early-warning${qs({ term })}`),
  });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data.data;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ink-500">مستوى الخطر</p>
            <p className="font-display text-2xl font-extrabold">{data.risk_level}</p>
            <p className="text-xs text-ink-500">درجة {formatInt(data.risk_score)} / 100</p>
          </div>
          <ProgressBar value={data.risk_score} max={100} tone={data.risk_level === 'HIGH' ? 'danger' : 'gold'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المؤشرات</CardTitle>
        </CardHeader>
        <CardContent>
          {data.indicators.length === 0 ? (
            <EmptyState title="لا توجد مؤشرات" description="الطالب ضمن الحدود الآمنة حاليًا." />
          ) : (
            <div className="space-y-2">
              {data.indicators.map((indicator) => (
                <div key={indicator.code} className="rounded-xl border border-ink-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-900">{indicator.message_ar}</p>
                    <Badge
                      tone={indicator.severity === 'high' ? 'danger' : indicator.severity === 'medium' ? 'warning' : 'neutral'}
                    >
                      {indicator.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{indicator.message_en}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-400">
                    {indicator.rule_code} · مادة {indicator.article} · ص {indicator.page}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إجراءات مقترحة</CardTitle>
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
  );
}

function GraduationTab({ studentId, term }: { studentId: string; term: string }) {
  const query = useQuery({
    queryKey: ['advisor', 'student', studentId, 'graduation', term],
    queryFn: () => api<{ data: GraduationResult }>(`/advisor/students/${studentId}/graduation-audit${qs({ term })}`),
  });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data.data;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <ProgressBar value={data.passed_credits} max={data.required_credits} label="التقدم في الساعات" />
          <div className="flex flex-wrap gap-2">
            <Badge tone={data.eligible_to_graduate ? 'success' : 'warning'}>
              {data.eligible_to_graduate ? 'مؤهل للتخرج' : 'غير مكتمل'}
            </Badge>
            <Badge tone={data.honors ? 'gold' : 'neutral'}>{data.honors ? 'مرتبة شرف' : 'بدون شرف'}</Badge>
            <Badge tone="neutral">
              {formatInt(data.passed_credits)} / {formatInt(data.required_credits)} ساعة
            </Badge>
          </div>
          <DecisionCard decision={data.decision} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المتطلبات المتبقية</CardTitle>
        </CardHeader>
        <CardContent>
          {data.missing.length === 0 ? (
            <EmptyState title="لا توجد متطلبات متبقية" />
          ) : (
            <div className="space-y-2">
              {data.missing.map((item, index) => (
                <div key={`${item.requirement}-${index}`} className="rounded-xl border border-ink-100 p-3">
                  <p className="text-sm font-semibold text-ink-900">{item.message_ar}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{item.message_en}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-400">
                    {item.requirement} · {item.rule_code} · مادة {item.article} · ص {item.page}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotesTab({ studentId }: { studentId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<'advisor_only' | 'student'>('advisor_only');

  const query = useQuery({
    queryKey: ['advisor', 'student', studentId, 'notes'],
    queryFn: () => api<{ data: AdvisingNote[] }>(`/advisor/students/${studentId}/notes`),
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ data: AdvisingNote }>(`/advisor/students/${studentId}/notes`, {
        method: 'POST',
        body: { note: note.trim(), visibility },
      }),
    onSuccess: async () => {
      toast.success('تمت إضافة الملاحظة');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'student', studentId, 'notes'] });
    },
    onError: (error) => toast.error('تعذر إضافة الملاحظة', errorMessage(error)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>ملاحظة جديدة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            label="نص الملاحظة"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={5000}
            placeholder="ملاحظة إرشادية داخلية أو مشتركة مع الطالب…"
          />
          <Select
            label="الظهور"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as typeof visibility)}
            options={[
              { value: 'advisor_only', label: 'للمرشد فقط' },
              { value: 'student', label: 'مرئية للطالب' },
            ]}
          />
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={note.trim().length === 0}
            icon={<MessageSquarePlus className="h-4 w-4" />}
            className="w-full"
          >
            إضافة الملاحظة
          </Button>
          <Alert tone="info" icon={<ShieldCheck className="h-4 w-4" />}>
            تُسجّل الملاحظات في سجل التدقيق ولا يمكن تعديلها لاحقًا من الواجهة.
          </Alert>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{formatInt(query.data?.data.length ?? 0)} ملاحظة</span>}>
            الملاحظات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <LoadingBlock />
          ) : query.isError ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : (query.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="لا توجد ملاحظات" description="أضف أول ملاحظة إرشادية لهذا الطالب." />
          ) : (
            <div className="space-y-2">
              {query.data?.data.map((item) => (
                <div key={item.id} className="rounded-xl border border-ink-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink-700">{item.advisor_name}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={item.visibility === 'student' ? 'info' : 'neutral'}>
                        {item.visibility === 'student' ? 'مرئية للطالب' : 'داخلية'}
                      </Badge>
                      <span className="text-[11px] text-ink-400">{formatDate(item.created_at, true)}</span>
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink-700">{item.note}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
