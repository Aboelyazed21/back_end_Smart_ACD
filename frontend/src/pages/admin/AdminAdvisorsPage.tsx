import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, UserCog } from 'lucide-react';
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdvisorAdminRow | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [office, setOffice] = useState('');
  const [maxStudents, setMaxStudents] = useState('60');

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
      toast.success('تم تحديث بيانات المرشد');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'advisors'] });
    },
    onError: (error) => toast.error('تعذر تحديث المرشد', errorMessage(error)),
  });

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
        eyebrow="إدارة المرشدين"
        title="المرشدون الأكاديميون"
        description="إدارة أقسام المرشدين، مكاتبهم، والحد الأقصى لعدد الطلاب. لا يمكن إسناد طالب بعد بلوغ الحد."
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
              لا يوجد مرشدون. أنشئ حساب مرشد من صفحة المستخدمين.
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
                    <Th>المرشد</Th>
                    <Th>القسم</Th>
                    <Th>المكتب</Th>
                    <Th>الطلاب</Th>
                    <Th>الحد الأقصى</Th>
                    <Th>الحالة</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmpty colSpan={7} message="لا توجد بيانات." />
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
                            {advisor.status === 'active' ? 'نشط' : advisor.status}
                          </Badge>
                          {advisor.student_count >= advisor.max_students && (
                            <Badge tone="danger" className="ms-1">
                              ممتلئ
                            </Badge>
                          )}
                        </Td>
                        <Td>
                          <IconButton
                            label="تعديل المرشد"
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
        title="تعديل بيانات المرشد"
        description={editing ? `${editing.full_name} · ${editing.student_count} طالب مسند` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button onClick={() => update.mutate()} loading={update.isPending}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <Select
            label="القسم"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            placeholder="بدون قسم"
            options={departmentOptions}
          />
          <Input
            label="المكتب"
            value={office}
            onChange={(event) => setOffice(event.target.value)}
            maxLength={200}
            placeholder="مبنى الكلية — 204"
          />
          <Input
            label="الحد الأقصى للطلاب"
            type="number"
            min={1}
            max={500}
            value={maxStudents}
            onChange={(event) => setMaxStudents(event.target.value)}
            error={
              editing && Number(maxStudents) < editing.student_count
                ? `لا يمكن أن يقل الحد عن ${editing.student_count} طالبًا مسندًا`
                : undefined
            }
            hint="يجب أن يكون الحد أكبر من أو يساوي عدد الطلاب الحالي."
          />
        </div>
      </Modal>
    </div>
  );
}
