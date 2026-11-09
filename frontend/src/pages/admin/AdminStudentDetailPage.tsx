import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Pencil } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { AdminStudentDetail, AdvisorAdminRow, Department, Program } from '../../lib/types';
import { PLAN_STATUS_LABELS, PROGRAM_LABELS } from '../../lib/constants';
import { formatDate, formatInt, formatNumber, formatTerm } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { KeyValue, PageHeader } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export function AdminStudentDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [program, setProgram] = useState<Program>('CS');
  const [level, setLevel] = useState('1');
  const [advisorId, setAdvisorId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [cgpa, setCgpa] = useState('0');
  const [passedCredits, setPassedCredits] = useState('0');
  const [transferCredits, setTransferCredits] = useState('0');
  const [regularSemesters, setRegularSemesters] = useState('0');
  const [admissionTerm, setAdmissionTerm] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'student', id],
    queryFn: () => api<{ data: AdminStudentDetail }>(`/admin/students/${id}`),
    enabled: Boolean(id),
  });
  const advisors = useQuery({
    queryKey: ['admin', 'advisors'],
    queryFn: () => api<{ data: AdvisorAdminRow[] }>('/admin/advisors'),
  });
  const departments = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api<{ data: Department[] }>('/admin/departments'),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/admin/students/${id}`, {
        method: 'PATCH',
        body: {
          program,
          level: Number(level),
          advisorId: advisorId || null,
          departmentId: departmentId || null,
          ...(admissionTerm.trim() ? { admissionTerm: admissionTerm.trim() } : {}),
          cgpa: Number(cgpa),
          passedCredits: Number(passedCredits),
          transferCredits: Number(transferCredits),
          regularSemestersCompleted: Number(regularSemesters),
        },
      }),
    onSuccess: async () => {
      toast.success('تم تحديث بيانات الطالب');
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'student', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'students'] });
    },
    onError: (error) => toast.error('تعذر تحديث البيانات', errorMessage(error)),
  });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data.data;
  const student = data.student;
  const studentRow = student as unknown as Record<string, unknown>;
  const studentCode = String(studentRow.student_code ?? '');
  const cgpaValue = Number(studentRow.current_cgpa ?? 0);
  const passed = Number(studentRow.passed_credits ?? 0);
  const transfer = Number(studentRow.transfer_credits ?? 0);

  const openEdit = () => {
    setProgram(String(studentRow.program ?? 'CS') as Program);
    setLevel(String(studentRow.level ?? 1));
    setAdvisorId(String(studentRow.advisor_id ?? ''));
    setDepartmentId(String(studentRow.department_id ?? ''));
    setCgpa(String(studentRow.current_cgpa ?? 0));
    setPassedCredits(String(studentRow.passed_credits ?? 0));
    setTransferCredits(String(studentRow.transfer_credits ?? 0));
    setRegularSemesters(String(studentRow.regular_semesters_completed ?? 0));
    setAdmissionTerm(String(studentRow.admission_term ?? ''));
    setOpen(true);
  };

  const departmentOptions = (departments.data?.data ?? []).map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name_ar}`,
  }));
  const advisorOptions = (advisors.data?.data ?? []).map((item) => ({
    value: item.id,
    label: `${item.full_name} (${item.student_count}/${item.max_students})`,
  }));

  return (
    <div>
      <Link
        to="/admin/students"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowRight className="h-4 w-4" /> كل الطلاب
      </Link>

      <PageHeader
        eyebrow={`سجل الطالب · ${studentCode}`}
        title={String(studentRow.full_name ?? 'طالب')}
        description={`${PROGRAM_LABELS[(studentRow.program as Program) ?? 'CS'].ar} — المستوى ${formatInt(Number(studentRow.level ?? 1))}`}
        actions={
          <Button variant="outline" onClick={openEdit} icon={<Pencil className="h-4 w-4" />}>
            تعديل البيانات
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>البيانات الأكاديمية</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label="رقم الطالب" value={<span className="font-mono">{studentCode}</span>} />
              <KeyValue label="البريد" value={<span dir="ltr">{String(studentRow.email ?? '—')}</span>} />
              <KeyValue label="الهاتف" value={<span dir="ltr">{String(studentRow.phone ?? '—')}</span>} />
              <KeyValue label="البرنامج" value={PROGRAM_LABELS[(studentRow.program as Program) ?? 'CS'].ar} />
              <KeyValue label="المستوى" value={formatInt(Number(studentRow.level ?? 1))} />
              <KeyValue label="CGPA" value={formatNumber(cgpaValue, 2)} />
              <KeyValue label="الساعات المجتازة" value={formatInt(passed)} />
              <KeyValue label="الساعات المحوّلة" value={formatInt(transfer)} />
              <KeyValue
                label="الفصول النظامية"
                value={formatInt(Number(studentRow.regular_semesters_completed ?? 0))}
              />
              <KeyValue
                label="فصل القبول"
                value={studentRow.admission_term ? formatTerm(String(studentRow.admission_term)) : '—'}
              />
              <KeyValue
                label="الحالة"
                value={<Badge tone={studentRow.status === 'active' ? 'success' : 'neutral'}>{String(studentRow.status)}</Badge>}
              />
              {Boolean(studentRow.is_demo) && <KeyValue label="حساب" value={<Badge tone="neutral">تجريبي</Badge>} />}
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>المرشد الأكاديمي</CardTitle>
          </CardHeader>
          <CardContent>
            {data.advisor ? (
              <dl>
                <KeyValue label="الاسم" value={data.advisor.full_name} />
                <KeyValue label="البريد" value={<span dir="ltr">{data.advisor.email}</span>} />
                <KeyValue label="المكتب" value={data.advisor.office_location ?? '—'} />
              </dl>
            ) : (
              <Alert tone="warning" title="بلا مرشد">
                هذا الطالب غير مسند لمرشد. استخدم «تعديل البيانات» لإسناد مرشد.
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle action={<span className="text-xs text-ink-500">{formatInt(data.enrollments.length)} محاولة</span>}>
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
                    <Th>الحالة</Th>
                    <Th>التقدير</Th>
                    <Th>المحاولة</Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.enrollments.length === 0 ? (
                    <TableEmpty colSpan={5} message="لا توجد بيانات." />
                  ) : (
                    data.enrollments.map((row) => (
                      <Tr key={row.id}>
                        <Td>
                          <p className="font-mono text-xs font-bold text-brand-700">{row.course_code}</p>
                          <p className="text-xs text-ink-600">{row.name_en}</p>
                        </Td>
                        <Td className="text-xs">{formatTerm(row.term)}</Td>
                        <Td>
                          <Badge
                            tone={
                              row.status === 'passed'
                                ? 'success'
                                : row.status === 'failed' || row.status === 'absent'
                                  ? 'danger'
                                  : 'info'
                            }
                          >
                            {row.status}
                          </Badge>
                        </Td>
                        <Td className="font-mono">{row.grade_letter ?? '—'}</Td>
                        <Td>{formatInt(row.attempt_no)}</Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>الخطط</CardTitle>
            </CardHeader>
            <CardContent>
              {data.plans.length === 0 ? (
                <p className="text-sm text-ink-500">لا توجد خطط.</p>
              ) : (
                <div className="space-y-2">
                  {data.plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{formatTerm(plan.term)}</p>
                        <p className="text-xs text-ink-500">{formatInt(plan.total_credits)} ساعة</p>
                      </div>
                      <Badge tone={(PLAN_STATUS_LABELS[plan.status]?.tone as never) ?? 'neutral'}>
                        {PLAN_STATUS_LABELS[plan.status]?.ar ?? plan.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الحالات المحوّلة</CardTitle>
            </CardHeader>
            <CardContent>
              {data.escalations.length === 0 ? (
                <p className="text-sm text-ink-500">لا توجد حالات.</p>
              ) : (
                <div className="space-y-2">
                  {data.escalations.map((item) => (
                    <div key={item.id} className="rounded-xl border border-ink-100 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-brand-700">{item.ticket_no}</span>
                        <Badge tone={item.status === 'resolved' || item.status === 'closed' ? 'success' : 'warning'}>
                          {item.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-ink-800">{item.subject}</p>
                      <p className="text-[11px] text-ink-400">{formatDate(item.created_at, true)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="تعديل بيانات الطالب"
        description="أي تغيير يؤثر على تقييم الأهلية والموقف الأكاديمي في الطلبات القادمة. تُسجّل التغييرات في سجل التدقيق."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => update.mutate()} loading={update.isPending}>
              حفظ التعديلات
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="البرنامج"
              value={program}
              onChange={(event) => setProgram(event.target.value as Program)}
              options={(Object.keys(PROGRAM_LABELS) as Program[]).map((code) => ({
                value: code,
                label: PROGRAM_LABELS[code].ar,
              }))}
            />
            <Select
              label="المستوى"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: `المستوى ${value}` }))}
            />
            <Select
              label="المرشد"
              value={advisorId}
              onChange={(event) => setAdvisorId(event.target.value)}
              placeholder="بدون مرشد"
              options={advisorOptions}
            />
            <Select
              label="القسم"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              placeholder="بدون قسم"
              options={departmentOptions}
            />
            <Input
              label="فصل القبول"
              dir="ltr"
              value={admissionTerm}
              onChange={(event) => setAdmissionTerm(event.target.value)}
              placeholder="2024-2025-fall"
              hint="الصيغة: YYYY-YYYY-season"
            />
            <Input
              label="CGPA"
              type="number"
              min={0}
              max={4}
              step="0.01"
              value={cgpa}
              onChange={(event) => setCgpa(event.target.value)}
            />
            <Input
              label="الساعات المجتازة"
              type="number"
              min={0}
              max={300}
              value={passedCredits}
              onChange={(event) => setPassedCredits(event.target.value)}
            />
            <Input
              label="الساعات المحوّلة"
              type="number"
              min={0}
              max={54}
              value={transferCredits}
              onChange={(event) => setTransferCredits(event.target.value)}
            />
            <Input
              label="الفصول النظامية المكتملة"
              type="number"
              min={0}
              max={40}
              value={regularSemesters}
              onChange={(event) => setRegularSemesters(event.target.value)}
            />
          </div>
          <Alert tone="warning">
            تعديل CGPA أو الساعات يدويًا يغيّر أهلية الطالب. راجع البيانات قبل الحفظ.
          </Alert>
        </div>
      </Modal>
    </div>
  );
}
