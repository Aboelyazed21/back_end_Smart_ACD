import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { AdvisorAdminRow, Department, Paginated, Program, User } from '../../lib/types';
import { PROGRAM_LABELS, ROLE_LABELS } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Checkbox, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

type Role = 'student' | 'advisor' | 'admin';

const STATUS_META: Record<string, { ar: string; tone: 'success' | 'neutral' | 'danger' }> = {
  active: { ar: 'نشط', tone: 'success' },
  inactive: { ar: 'غير نشط', tone: 'neutral' },
  suspended: { ar: 'موقوف', tone: 'danger' },
};

interface CreateForm {
  email: string;
  fullName: string;
  role: Role;
  phone: string;
  password: string;
  isDemo: boolean;
  studentCode: string;
  program: Program;
  level: string;
  advisorId: string;
  departmentId: string;
  cgpa: string;
  passedCredits: string;
  officeLocation: string;
  maxStudents: string;
}

const emptyCreate = (): CreateForm => ({
  email: '',
  fullName: '',
  role: 'student',
  phone: '',
  password: '',
  isDemo: false,
  studentCode: '',
  program: 'CS',
  level: '1',
  advisorId: '',
  departmentId: '',
  cgpa: '0',
  passedCredits: '0',
  officeLocation: '',
  maxStudents: '60',
});

export function AdminUsersPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreate());
  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState('active');

  const users = useQuery({
    queryKey: ['admin', 'users', role, status, submittedSearch, page],
    queryFn: () =>
      api<Paginated<User>>(
        `/admin/users${qs({ role: role || undefined, status: status || undefined, search: submittedSearch || undefined, page, limit: 20 })}`,
      ),
  });
  const advisors = useQuery({
    queryKey: ['admin', 'advisors'],
    queryFn: () => api<{ data: AdvisorAdminRow[] }>('/admin/advisors'),
  });
  const departments = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api<{ data: Department[] }>('/admin/departments'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api('/admin/users', {
        method: 'POST',
        body: {
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          role: form.role,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.password ? { password: form.password } : {}),
          ...(form.isDemo ? { isDemo: true } : {}),
          ...(form.role === 'student'
            ? {
                student: {
                  studentCode: form.studentCode.trim(),
                  program: form.program,
                  level: Number(form.level || 1),
                  ...(form.advisorId ? { advisorId: form.advisorId } : {}),
                  ...(form.departmentId ? { departmentId: form.departmentId } : {}),
                  cgpa: Number(form.cgpa || 0),
                  passedCredits: Number(form.passedCredits || 0),
                },
              }
            : {}),
          ...(form.role === 'advisor'
            ? {
                advisor: {
                  ...(form.departmentId ? { departmentId: form.departmentId } : {}),
                  ...(form.officeLocation.trim() ? { officeLocation: form.officeLocation.trim() } : {}),
                  maxStudents: Number(form.maxStudents || 60),
                },
              }
            : {}),
        },
      }),
    onSuccess: async () => {
      toast.success('تم إنشاء المستخدم', 'أُرسلت كلمة مرور مؤقتة إلى بريده إن لم تحدد كلمة مرور.');
      setCreateOpen(false);
      setForm(emptyCreate());
      await invalidate();
    },
    onError: (error) => toast.error('تعذر إنشاء المستخدم', errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/admin/users/${editing?.id}`, {
        method: 'PATCH',
        body: {
          fullName: editName.trim(),
          ...(editPhone.trim() ? { phone: editPhone.trim() } : {}),
          status: editStatus,
        },
      }),
    onSuccess: async () => {
      toast.success('تم تحديث المستخدم');
      setEditing(null);
      await invalidate();
    },
    onError: (error) => toast.error('تعذر تحديث المستخدم', errorMessage(error)),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}/reset-password`, { method: 'POST' }),
    onSuccess: () => toast.success('تمت إعادة تعيين كلمة المرور', 'أُرسلت كلمة مرور مؤقتة للبريد.'),
    onError: (error) => toast.error('تعذر إعادة التعيين', errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('تم تعطيل الحساب');
      await invalidate();
    },
    onError: (error) => toast.error('تعذر حذف المستخدم', errorMessage(error)),
  });

  const rows = users.data?.data ?? [];
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
      <PageHeader
        eyebrow="إدارة المستخدمين"
        title="حسابات المنصة"
        description="إنشاء حسابات الطلاب والمرشدين والمسؤولين. لا تُحذف الحسابات نهائيًا — تُعطّل وتُسجّل العملية في سجل التدقيق."
        actions={
          <Button onClick={() => setCreateOpen(true)} icon={<UserPlus className="h-4 w-4" />}>
            مستخدم جديد
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSubmittedSearch(search.trim());
            }}
          >
            <Input
              label="بحث"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="الاسم أو البريد"
              leading={<Search className="h-4 w-4" />}
            />
            <Select
              label="الدور"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'كل الأدوار' },
                { value: 'student', label: ROLE_LABELS.student },
                { value: 'advisor', label: ROLE_LABELS.advisor },
                { value: 'admin', label: ROLE_LABELS.admin },
              ]}
            />
            <Select
              label="الحالة"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'كل الحالات' },
                { value: 'active', label: 'نشط' },
                { value: 'inactive', label: 'غير نشط' },
                { value: 'suspended', label: 'موقوف' },
              ]}
            />
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full">
                تطبيق البحث
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {users.isLoading ? (
        <LoadingBlock />
      ) : users.isError ? (
        <ErrorState message={errorMessage(users.error)} onRetry={() => void users.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="لا يوجد مستخدمون" description="جرّب تعديل عوامل التصفية أو أنشئ مستخدمًا جديدًا." />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>المستخدم</Th>
                    <Th>الدور</Th>
                    <Th>الحالة</Th>
                    <Th>كلمة المرور</Th>
                    <Th>أُنشئ</Th>
                    <Th>إجراءات</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((user) => {
                    const statusMeta = STATUS_META[user.status] ?? STATUS_META.inactive;
                    return (
                      <Tr key={user.id}>
                        <Td>
                          <p className="text-sm font-bold text-ink-900">{user.fullName}</p>
                          <p className="text-xs text-ink-500" dir="ltr">
                            {user.email}
                          </p>
                          {user.phone && <p className="text-[11px] text-ink-400">{user.phone}</p>}
                        </Td>
                        <Td>
                          <Badge tone={user.role === 'admin' ? 'gold' : user.role === 'advisor' ? 'info' : 'brand'}>
                            {ROLE_LABELS[user.role]}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge tone={statusMeta.tone}>{statusMeta.ar}</Badge>
                          {user.isDemo && (
                            <Badge tone="neutral" className="ms-1">
                              تجريبي
                            </Badge>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={user.mustChangePassword ? 'warning' : 'neutral'}>
                            {user.mustChangePassword ? 'تغيير مطلوب' : 'مستقرة'}
                          </Badge>
                        </Td>
                        <Td className="text-xs">{formatDate(user.createdAt)}</Td>
                        <Td>
                          <div className="flex items-center gap-0.5">
                            <IconButton
                              label="تعديل"
                              onClick={() => {
                                setEditing(user);
                                setEditName(user.fullName);
                                setEditPhone(user.phone ?? '');
                                setEditStatus(user.status);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label="إعادة تعيين كلمة المرور"
                              onClick={() => resetPassword.mutate(user.id)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="تعطيل الحساب" onClick={() => remove.mutate(user.id)}>
                              <Trash2 className="h-4 w-4 text-danger" />
                            </IconButton>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
            {users.data && <PaginationBar pagination={users.data.pagination} onPage={setPage} />}
          </CardContent>
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="إنشاء مستخدم"
        description="الطلاب يحتاجون بريدًا بنطاق الكلية ورقم طالب. المرشدون يحتاجون حدًا أقصى للطلاب."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              icon={<Plus className="h-4 w-4" />}
              disabled={!form.email.trim() || form.fullName.trim().length < 2}
            >
              إنشاء الحساب
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="الاسم الكامل"
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              required
            />
            <Input
              label="البريد الإلكتروني"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            <Select
              label="الدور"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
              options={[
                { value: 'student', label: 'طالب' },
                { value: 'advisor', label: 'مرشد أكاديمي' },
                { value: 'admin', label: 'مسؤول نظام' },
              ]}
            />
            <Input
              label="الهاتف (اختياري)"
              dir="ltr"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
            <Input
              label="كلمة مرور مبدئية (اختياري)"
              type="text"
              dir="ltr"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              hint="إن تركتها فارغة يُرسل النظام كلمة مؤقتة بالبريد."
            />
            <div className="flex items-end">
              <Checkbox
                label="حساب تجريبي"
                checked={form.isDemo}
                onChange={(event) => setForm({ ...form, isDemo: event.target.checked })}
              />
            </div>
          </div>

          {form.role === 'student' && (
            <div className="rounded-xl border border-ink-100 p-4">
              <p className="mb-3 text-sm font-bold text-ink-900">بيانات الطالب</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="رقم الطالب"
                  dir="ltr"
                  value={form.studentCode}
                  onChange={(event) => setForm({ ...form, studentCode: event.target.value })}
                  placeholder="20240001"
                  required
                />
                <Select
                  label="البرنامج"
                  value={form.program}
                  onChange={(event) => setForm({ ...form, program: event.target.value as Program })}
                  options={(Object.keys(PROGRAM_LABELS) as Program[]).map((program) => ({
                    value: program,
                    label: PROGRAM_LABELS[program].ar,
                  }))}
                />
                <Select
                  label="المستوى"
                  value={form.level}
                  onChange={(event) => setForm({ ...form, level: event.target.value })}
                  options={[1, 2, 3, 4].map((level) => ({ value: String(level), label: `المستوى ${level}` }))}
                />
                <Select
                  label="المرشد (اختياري)"
                  value={form.advisorId}
                  onChange={(event) => setForm({ ...form, advisorId: event.target.value })}
                  placeholder="بدون مرشد"
                  options={advisorOptions}
                />
                <Input
                  label="CGPA"
                  type="number"
                  min={0}
                  max={4}
                  step="0.01"
                  value={form.cgpa}
                  onChange={(event) => setForm({ ...form, cgpa: event.target.value })}
                />
                <Input
                  label="الساعات المجتازة"
                  type="number"
                  min={0}
                  value={form.passedCredits}
                  onChange={(event) => setForm({ ...form, passedCredits: event.target.value })}
                />
                <Select
                  label="القسم (اختياري)"
                  value={form.departmentId}
                  onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
                  placeholder="بدون قسم"
                  options={departmentOptions}
                />
              </div>
            </div>
          )}

          {form.role === 'advisor' && (
            <div className="rounded-xl border border-ink-100 p-4">
              <p className="mb-3 text-sm font-bold text-ink-900">بيانات المرشد</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="المكتب"
                  value={form.officeLocation}
                  onChange={(event) => setForm({ ...form, officeLocation: event.target.value })}
                  placeholder="مبنى الكلية — 204"
                />
                <Input
                  label="الحد الأقصى للطلاب"
                  type="number"
                  min={1}
                  max={500}
                  value={form.maxStudents}
                  onChange={(event) => setForm({ ...form, maxStudents: event.target.value })}
                />
                <Select
                  label="القسم (اختياري)"
                  value={form.departmentId}
                  onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
                  placeholder="بدون قسم"
                  options={departmentOptions}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="تعديل مستخدم"
        description={editing?.email}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button onClick={() => update.mutate()} loading={update.isPending}>
              حفظ التعديلات
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <Input
            label="الاسم الكامل"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            required
          />
          <Input
            label="الهاتف"
            dir="ltr"
            value={editPhone}
            onChange={(event) => setEditPhone(event.target.value)}
          />
          <Select
            label="الحالة"
            value={editStatus}
            onChange={(event) => setEditStatus(event.target.value)}
            options={[
              { value: 'active', label: 'نشط' },
              { value: 'inactive', label: 'غير نشط' },
              { value: 'suspended', label: 'موقوف' },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
