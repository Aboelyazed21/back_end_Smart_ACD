import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, UserCog, UserPlus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { AdvisorAdminRow, Department } from '../../lib/types';
import { formatInt } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export function AdminAdvisorsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdvisorAdminRow | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [office, setOffice] = useState('');
  const [maxStudents, setMaxStudents] = useState('60');
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newOffice, setNewOffice] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'advisors'],
    queryFn: () => api<{ data: AdvisorAdminRow[] }>('/admin/advisors'),
  });
  const departments = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api<{ data: Department[] }>('/admin/departments'),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/admin/advisors/${editing?.id}`, {
        method: 'PATCH',
        body: {
          departmentId: departmentId || null,
          ...(office.trim() ? { officeLocation: office.trim() } : {}),
          maxStudents: Number(maxStudents),
        },
      }),
    onSuccess: async () => {
      toast.success(t('تم تحديث بيانات المرشد'));
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'advisors'] });
    },
    onError: (error) => toast.error(t('تعذر تحديث المرشد'), errorMessage(error)),
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ data: { user: { id: string; email: string }; advisor: AdvisorAdminRow } }>('/admin/advisors', {
        method: 'POST',
        body: {
          email: newEmail.trim(),
          ...(newName.trim() ? { fullName: newName.trim() } : {}),
          ...(newDepartmentId ? { departmentId: newDepartmentId } : {}),
          ...(newOffice.trim() ? { officeLocation: newOffice.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success(
        t('تم إنشاء حساب مرشد أكاديمي'),
        t('تم إرسال كلمة المرور المؤقتة إلى بريد المرشد. سيُطلب منه تغييرها عند أول دخول.'),
      );
      resetAddForm();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'advisors'] });
    },
    onError: (error) => toast.error(t('تعذر إنشاء الحساب'), errorMessage(error)),
  });

  function resetAddForm() {
    setAdding(false);
    setNewEmail('');
    setNewName('');
    setNewDepartmentId('');
    setNewOffice('');
  }

  const rows = query.data?.data ?? [];
  const departmentOptions = (departments.data?.data ?? []).map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name_ar}`,
  }));
  const departmentName = (id: string | null) =>
    departments.data?.data.find((item) => item.id === id)?.name_ar ?? '—';

  return (
    <div>
      <PageHeader
        eyebrow={t('إدارة المرشدين')}
        title={t('المرشدون الأكاديميون')}
        description={t(
          'إدارة أقسام المرشدين، مكاتبهم، والحد الأقصى لعدد الطلاب. يمكنك إنشاء مرشد جديد بالبريد الإلكتروني مباشرة.',
        )}
        actions={
          <Button
            onClick={() => {
              resetAddForm();
              setAdding(true);
            }}
            icon={<UserPlus className="h-4 w-4" />}
          >
            {t('إضافة مرشد بالبريد')}
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-500">
              <UserCog className="h-8 w-8 text-ink-300" />
              {t('لا يوجد مرشدون بعد. أنشئ أول مرشد بالبريد الإلكتروني من الزر بالأعلى.')}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>{t('المرشد')}</Th>
                    <Th>{t('القسم')}</Th>
                    <Th>{t('المكتب')}</Th>
                    <Th>{t('الطلاب')}</Th>
                    <Th>{t('الحد الأقصى')}</Th>
                    <Th>{t('الحالة')}</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmpty colSpan={7} message={t('لا توجد بيانات.')} />
                  ) : (
                    rows.map((advisor) => (
                      <Tr key={advisor.id}>
                        <Td>
                          <p className="text-sm font-bold text-ink-900">{advisor.full_name}</p>
                          <p className="text-xs text-ink-500" dir="ltr">
                            {advisor.email}
                          </p>
                        </Td>
                        <Td className="text-xs">{departmentName(advisor.department_id)}</Td>
                        <Td className="text-xs">{advisor.office_location ?? '—'}</Td>
                        <Td>{formatInt(advisor.student_count)}</Td>
                        <Td>{formatInt(advisor.max_students)}</Td>
                        <Td>
                          <Badge tone={advisor.status === 'active' ? 'success' : 'neutral'}>
                            {advisor.status === 'active' ? t('نشط') : advisor.status}
                          </Badge>
                          {advisor.student_count >= advisor.max_students && (
                            <Badge tone="danger" className="ms-1">
                              {t('ممتلئ')}
                            </Badge>
                          )}
                        </Td>
                        <Td>
                          <IconButton
                            label={t('تعديل المرشد')}
                            onClick={() => {
                              setEditing(advisor);
                              setDepartmentId(advisor.department_id ?? '');
                              setOffice(advisor.office_location ?? '');
                              setMaxStudents(String(advisor.max_students));
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t('تعديل بيانات المرشد')}
        description={
          editing
            ? t('{{name}} · {{n}} طالب مسند', { name: editing.full_name, n: editing.student_count })
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => update.mutate()} loading={update.isPending}>
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <Select
            label={t('القسم')}
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            placeholder={t('بدون قسم')}
            options={departmentOptions}
          />
          <Input
            label={t('المكتب')}
            value={office}
            onChange={(event) => setOffice(event.target.value)}
            maxLength={200}
            placeholder={t('مبنى الكلية — 204')}
          />
          <Input
            label={t('الحد الأقصى للطلاب')}
            type="number"
            min={1}
            max={500}
            value={maxStudents}
            onChange={(event) => setMaxStudents(event.target.value)}
            error={
              editing && Number(maxStudents) < editing.student_count
                ? t('لا يمكن أن يقل الحد عن {{n}} طالبًا مسندًا', { n: editing.student_count })
                : undefined
            }
            hint={t('يجب أن يكون الحد أكبر من أو يساوي عدد الطلاب الحالي.')}
          />
        </div>
      </Modal>

      <Modal
        open={adding}
        onClose={resetAddForm}
        title={t('إضافة مرشد بالبريد')}
        description={t('أدخل بريد المرشد الأكاديمي لإنشاء حساب مرشد عادي وإرسال كلمة المرور المؤقتة إليه.')}
        footer={
          <>
            <Button variant="ghost" onClick={resetAddForm}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!newEmail.trim()}
            >
              {t('إنشاء الحساب')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <Input
            label={t('البريد الإلكتروني')}
            type="email"
            dir="ltr"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="advisor@bua.edu.eg"
            required
          />
          <Input
            label={t('الاسم الكامل')}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={200}
            hint={t('اختياري. يُشتق الاسم من البريد إذا تُرك فارغًا.')}
          />
          <Select
            label={t('القسم')}
            value={newDepartmentId}
            onChange={(event) => setNewDepartmentId(event.target.value)}
            placeholder={t('بدون قسم')}
            options={departmentOptions}
          />
          <Input
            label={t('المكتب')}
            value={newOffice}
            onChange={(event) => setNewOffice(event.target.value)}
            maxLength={200}
            placeholder={t('مبنى الكلية — 204')}
          />
          <Alert tone="info">
            {t('ستُرسل كلمة المرور المؤقتة إلى البريد، ويُطلب من المرشد تغييرها عند أول دخول.')}
          </Alert>
        </div>
      </Modal>
    </div>
  );
}
