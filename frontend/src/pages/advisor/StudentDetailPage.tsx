import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [term, setTerm] = useState(currentTermValue());

  const query = useQuery({
    queryKey: ['advisor', 'student', id],
    queryFn: () => api<{ data: AdvisorStudentDetail }>(`/advisor/students/${id}`),
    enabled: Boolean(id),
  });

  if (query.isLoading) return <LoadingBlock label={t('جارٍ تحميل ملف الطالب…')} />;
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
        <ArrowRight className="h-4 w-4" /> {t('كل الطلاب')}
      </Link>

      <PageHeader
        eyebrow={t('ملف الطالب · {{code}}', { code: student.studentCode })}
        title={t('ملف الطالب {{code}}', { code: student.studentCode })}
        description={t('{{program}} — المستوى {{level}}. كل التقييمات استشارية ومبنية على اللائحة.', {
          program: t(PROGRAM_LABELS[student.program].ar),
          level: student.level,
        })}
        actions={
          <Select
            label={t('الفصل')}
            className="w-48"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            options={termSelectOptions(term)}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('المعدل التراكمي')}</p>
          <p className={cn('mt-1 font-display text-2xl font-extrabold', student.cgpa < 2 ? 'text-danger' : 'text-ink-950')}>
            {formatNumber(student.cgpa, 2)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {latestStanding?.term ? formatTerm(latestStanding.term) : '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('الساعات المجتازة')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-ink-950">{formatInt(student.passedCredits)}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {t('منها {{n}} محوّلة', { n: formatInt(student.transferCredits) })}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('الفصول النظامية')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-ink-950">
            {formatInt(student.regularSemestersCompleted)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">{t('من 16 كحد أقصى')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('الإنذارات')}</p>
          <p
            className={cn(
              'mt-1 font-display text-2xl font-extrabold',
              (latestStanding?.total_warnings ?? 0) > 0 ? 'text-danger' : 'text-emerald-700',
            )}
          >
            {formatInt(latestStanding?.total_warnings ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {t('{{n}} إنذار متتالٍ', { n: formatInt(latestStanding?.consecutive_warnings ?? 0) })}
          </p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-ink-100 bg-surface p-1 shadow-card">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
              tab === item.id ? 'bg-primary text-on-primary shadow-sm' : 'text-ink-600 hover:bg-ink-50',
            )}
          >
            {t(item.label)}
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
  const { t } = useTranslation();
  const student = profile.student;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>{t('بيانات الطالب')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <KeyValue label={t('رقم الطالب')} value={<span className="font-mono">{student.studentCode}</span>} />
            <KeyValue label={t('البرنامج')} value={t(PROGRAM_LABELS[student.program].ar)} />
            <KeyValue label={t('المستوى')} value={formatInt(student.level)} />
            <KeyValue
              label={t('فصل القبول')}
              value={student.admissionTerm ? formatTerm(student.admissionTerm) : '—'}
            />
            <KeyValue label={t('القسم')} value={profile.department?.name_ar ?? '—'} />
            <KeyValue label={t('المعدل')} value={formatNumber(student.cgpa, 2)} />
            <KeyValue label={t('الساعات المجتازة')} value={formatInt(student.passedCredits)} />
            <KeyValue label={t('الساعات المحوّلة')} value={formatInt(student.transferCredits)} />
          </dl>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{t('{{n}} خطة', { n: formatInt(plans.length) })}</span>}>
            {t('الخطط الدراسية')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <EmptyState title={t('لا توجد خطط')} description={t('لم يولّد الطالب أي مسودة خطة بعد.')} />
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
                        {formatInt(plan.total_credits)} {t('ساعة')} · {formatDate(plan.created_at)}
                      </p>
                    </div>
                    <Badge tone={(status?.tone as never) ?? 'neutral'}>{t(status?.ar ?? plan.status)}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{t('{{n}} محاولة', { n: formatInt(enrollments.length) })}</span>}>
            {t('السجل الأكاديمي')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>{t('المقرر')}</Th>
                  <Th>{t('الفصل')}</Th>
                  <Th>{t('الساعات')}</Th>
                  <Th>{t('التقدير')}</Th>
                  <Th>{t('النسبة')}</Th>
                  <Th>{t('الحالة')}</Th>
                  <Th>{t('المحاولة')}</Th>
                </Tr>
              </THead>
              <TBody>
                {enrollments.length === 0 ? (
                  <TableEmpty colSpan={7} message={t('لا توجد مقررات مسجلة.')} />
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
                          {t(GRADE_STATUS_LABELS[row.status] ?? row.status)}
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
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['advisor', 'student', studentId, 'eligibility', term],
    queryFn: () => api<{ data: BulkEligibility }>(`/advisor/students/${studentId}/eligibility${qs({ term })}`),
  });

  if (query.isLoading) return <LoadingBlock label={t('جارٍ تطبيق قواعد الأهلية…')} />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data.data;
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{t('قرار العبء الأكاديمي')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DecisionCard decision={data.loadDecision} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{t('{{n}} قرار', { n: formatInt(data.decisions.length) })}</span>}>
            {t('قرارات المقررات')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.decisions.length === 0 ? (
            <EmptyState title={t('لا توجد قرارات')} description={t('لا توجد مقررات مرشحة لهذا الفصل.')} />
          ) : (
            <div className="grid gap-2">
              {data.decisions.map((decision, index) => (
                <DecisionCard
                  key={`${decision.course_code ?? 'x'}-${decision.rule_code}-${index}`}
                  decision={decision}
                  title={decision.course_code ?? t('قرار')}
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
  const { t } = useTranslation();
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
          <p className="text-xs text-ink-500">{t('المستوى')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold">{formatInt(data.level)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('النتيجة')}</p>
          <p className="mt-1 text-sm font-bold text-ink-900">{data.classification}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('القرارات')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DecisionCard decision={data.decision} title={t('الملاحظة الأكاديمية')} />
          {data.dismissal_decision && <DecisionCard decision={data.dismissal_decision} title={t('خطر الفصل')} />}
          <DecisionCard decision={data.suspension_decision} title={t('حدود الإيقاف')} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <ProgressBar
            value={data.regular_semesters_completed}
            max={data.max_regular_semesters}
            label={t('الفصول النظامية المستهلكة')}
            tone={data.regular_semesters_completed >= data.max_regular_semesters ? 'danger' : 'brand'}
          />
          <div className="flex flex-wrap gap-2">
            <Badge tone={data.probation ? 'danger' : 'success'}>
              {data.probation ? t('ملاحظة أكاديمية') : t('لا ملاحظة')}
            </Badge>
            <Badge tone={data.dismissal_risk ? 'danger' : 'success'}>
              {data.dismissal_risk ? t('خطر فصل') : t('لا خطر فصل')}
            </Badge>
            <Badge tone={data.final_chance ? 'warning' : 'neutral'}>{data.final_chance ? t('فرصة أخيرة') : '—'}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WarningTab({ studentId, term }: { studentId: string; term: string }) {
  const { t } = useTranslation();
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
            <p className="text-xs text-ink-500">{t('مستوى الخطر')}</p>
            <p className="font-display text-2xl font-extrabold">{data.risk_level}</p>
            <p className="text-xs text-ink-500">{t('درجة {{n}} / 100', { n: formatInt(data.risk_score) })}</p>
          </div>
          <ProgressBar value={data.risk_score} max={100} tone={data.risk_level === 'HIGH' ? 'danger' : 'gold'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('المؤشرات')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.indicators.length === 0 ? (
            <EmptyState title={t('لا توجد مؤشرات')} description={t('الطالب ضمن الحدود الآمنة حاليًا.')} />
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
                    {indicator.rule_code} · {t('مادة {{n}}', { n: indicator.article })} · {t('ص {{n}}', { n: indicator.page })}
                  </p>
                </div>
              ))}
            </div>
          )}
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
  );
}

function GraduationTab({ studentId, term }: { studentId: string; term: string }) {
  const { t } = useTranslation();
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
          <ProgressBar value={data.passed_credits} max={data.required_credits} label={t('التقدم في الساعات')} />
          <div className="flex flex-wrap gap-2">
            <Badge tone={data.eligible_to_graduate ? 'success' : 'warning'}>
              {data.eligible_to_graduate ? t('مؤهل للتخرج') : t('غير مكتمل')}
            </Badge>
            <Badge tone={data.honors ? 'gold' : 'neutral'}>{data.honors ? t('مرتبة شرف') : t('بدون شرف')}</Badge>
            <Badge tone="neutral">
              {formatInt(data.passed_credits)} / {formatInt(data.required_credits)} {t('ساعة')}
            </Badge>
          </div>
          <DecisionCard decision={data.decision} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('المتطلبات المتبقية')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.missing.length === 0 ? (
            <EmptyState title={t('لا توجد متطلبات متبقية')} />
          ) : (
            <div className="space-y-2">
              {data.missing.map((item, index) => (
                <div key={`${item.requirement}-${index}`} className="rounded-xl border border-ink-100 p-3">
                  <p className="text-sm font-semibold text-ink-900">{item.message_ar}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{item.message_en}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-400">
                    {item.requirement} · {item.rule_code} · {t('مادة {{n}}', { n: item.article })} · {t('ص {{n}}', { n: item.page })}
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
  const { t } = useTranslation();
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
      toast.success(t('تمت إضافة الملاحظة'));
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'student', studentId, 'notes'] });
    },
    onError: (error) => toast.error(t('تعذر إضافة الملاحظة'), errorMessage(error)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>{t('ملاحظة جديدة')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            label={t('نص الملاحظة')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={5000}
            placeholder={t('ملاحظة إرشادية داخلية أو مشتركة مع الطالب…')}
          />
          <Select
            label={t('الظهور')}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as typeof visibility)}
            options={[
              { value: 'advisor_only', label: t('للمرشد فقط') },
              { value: 'student', label: t('مرئية للطالب') },
            ]}
          />
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={note.trim().length === 0}
            icon={<MessageSquarePlus className="h-4 w-4" />}
            className="w-full"
          >
            {t('إضافة الملاحظة')}
          </Button>
          <Alert tone="info" icon={<ShieldCheck className="h-4 w-4" />}>
            {t('تُسجّل الملاحظات في سجل التدقيق ولا يمكن تعديلها لاحقًا من الواجهة.')}
          </Alert>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle action={<span className="text-xs text-ink-500">{t('{{n}} ملاحظة', { n: formatInt(query.data?.data.length ?? 0) })}</span>}>
            {t('الملاحظات')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <LoadingBlock />
          ) : query.isError ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : (query.data?.data.length ?? 0) === 0 ? (
            <EmptyState title={t('لا توجد ملاحظات')} description={t('أضف أول ملاحظة إرشادية لهذا الطالب.')} />
          ) : (
            <div className="space-y-2">
              {query.data?.data.map((item) => (
                <div key={item.id} className="rounded-xl border border-ink-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink-700">{item.advisor_name}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={item.visibility === 'student' ? 'info' : 'neutral'}>
                        {item.visibility === 'student' ? t('مرئية للطالب') : t('داخلية')}
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
