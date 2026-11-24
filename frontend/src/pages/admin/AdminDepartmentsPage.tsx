import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2, Pencil, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Department } from '../../lib/types';
import { formatInt } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export function AdminDepartmentsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api<{ data: Department[] }>('/admin/departments'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api('/admin/departments', {
        method: 'POST',
        body: { code: code.trim().toUpperCase(), nameAr: nameAr.trim(), nameEn: nameEn.trim() },
      }),
    onSuccess: async () => {
      toast.success(t('تمت إضافة القسم'));
      setOpen(false);
      setCode('');
      setNameAr('');
      setNameEn('');
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر إضافة القسم'), errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/admin/departments/${editing?.id}`, {
        method: 'PATCH',
        body: { nameAr: nameAr.trim(), nameEn: nameEn.trim() },
      }),
    onSuccess: async () => {
      toast.success(t('تم تحديث القسم'));
      setEditing(null);
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر تحديث القسم'), errorMessage(error)),
  });

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={t('الأقسام')}
        title={t('أقسام الكلية')}
        description={t(
          'الأقسام تُستخدم في إسناد الطلاب والمرشدين. رمز القسم بحرفين إلى ثمانية أحرف لاتينية كبيرة.',
        )}
        actions={
          <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
            {t('إضافة قسم')}
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('لا توجد أقسام')}
          description={t('أضف أول قسم للكلية.')}
          icon={<Building2 className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>{t('الرمز')}</Th>
                    <Th>{t('الاسم العربي')}</Th>
                    <Th>{t('الاسم الإنجليزي')}</Th>
                    <Th>{t('عدد الطلاب')}</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmpty colSpan={5} message={t('لا توجد بيانات.')} />
                  ) : (
                    rows.map((item) => (
                      <Tr key={item.id}>
                        <Td className="font-mono text-xs font-bold text-brand-700">{item.code}</Td>
                        <Td className="text-sm font-semibold text-ink-900">{item.name_ar}</Td>
                        <Td className="text-xs text-ink-600">{item.name_en}</Td>
                        <Td>{formatInt(item.student_count ?? 0)}</Td>
                        <Td>
                          <IconButton
                            label="تعديل القسم"
                            onClick={() => {
                              setEditing(item);
                              setNameAr(item.name_ar);
                              setNameEn(item.name_en);
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
        open={open}
        onClose={() => setOpen(false)}
        title={t('إضافة قسم')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!code.trim() || nameAr.trim().length < 2 || nameEn.trim().length < 2}
            >
              {t('إضافة')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <Input
            label={t('رمز القسم')}
            dir="ltr"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="CS"
            maxLength={8}
            required
            hint={t('حروف لاتينية كبيرة فقط.')}
          />
          <Input
            label={t('الاسم العربي')}
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
            required
          />
          <Input
            label={t('الاسم الإنجليزي')}
            dir="ltr"
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            required
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t('تعديل القسم')}
        description={
          editing
            ? t('{{code}} · {{n}} طالب', { code: editing.code, n: formatInt(editing.student_count ?? 0) })
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => update.mutate()}
              loading={update.isPending}
              disabled={nameAr.trim().length < 2 || nameEn.trim().length < 2}
            >
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <Input
            label={t('الاسم العربي')}
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
            required
          />
          <Input
            label={t('الاسم الإنجليزي')}
            dir="ltr"
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            required
          />
        </div>
      </Modal>
    </div>
  );
}
