import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Check, Plus, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { OfficeHourRequest, OfficeHourSlot } from '../../lib/types';
import { REQUEST_STATUS_LABELS, WEEKDAYS } from '../../lib/constants';
import { formatDate, formatTime } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export function AdvisorOfficeHoursPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [weekday, setWeekday] = useState('0');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');

  const slots = useQuery({
    queryKey: ['advisor', 'office-hours'],
    queryFn: () => api<{ data: OfficeHourSlot[] }>('/advisor/office-hours'),
  });
  const requests = useQuery({
    queryKey: ['advisor', 'office-hour-requests'],
    queryFn: () => api<{ data: OfficeHourRequest[] }>('/advisor/office-hour-requests'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['advisor', 'office-hours'] });
    await queryClient.invalidateQueries({ queryKey: ['advisor', 'dashboard'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api('/advisor/office-hours', {
        method: 'POST',
        body: {
          weekday: Number(weekday),
          startTime,
          endTime,
          ...(location.trim() ? { location: location.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success(t('تمت إضافة الساعة المكتبية'));
      setOpen(false);
      setLocation('');
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر إضافة الموعد'), errorMessage(error)),
  });

  const toggle = useMutation({
    mutationFn: (slot: OfficeHourSlot) =>
      api(`/advisor/office-hours/${slot.id}`, {
        method: 'PATCH',
        body: { active: slot.active === false },
      }),
    onSuccess: async () => {
      toast.success(t('تم تحديث حالة الموعد'));
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر تحديث الموعد'), errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/advisor/office-hours/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('تم تعطيل الموعد'));
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر تعطيل الموعد'), errorMessage(error)),
  });

  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api(`/advisor/office-hour-requests/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: async () => {
      toast.success(t('تم تحديث طلب الساعة المكتبية'));
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'office-hour-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'dashboard'] });
    },
    onError: (error) => toast.error(t('تعذر تحديث الطلب'), errorMessage(error)),
  });

  const slotRows = slots.data?.data ?? [];
  const requestRows = requests.data?.data ?? [];
  const pending = requestRows.filter((row) => row.status === 'pending');

  return (
    <div>
      <PageHeader
        eyebrow={t('الساعات المكتبية')}
        title={t('مواعيد الإرشاد والطلبات')}
        description={t('أعلن مواعيدك المكتبية، وراجع طلبات الطلاب. لا يمكن إرسال أكثر من طلب نشط لنفس الموعد.')}
        actions={
          <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
            {t('إضافة موعد')}
          </Button>
        }
      />

      {pending.length > 0 && (
        <Alert tone="warning" className="mb-4" title={t('{{n}} طلب بانتظار قرارك', { n: pending.length })}>
          {t('راجع طلبات الطلاب أدناه قبل مواعيدهم.')}
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle action={<Badge tone="brand">{t('{{n}} موعد', { n: slotRows.length })}</Badge>}>
              {t('مواعيدي المكتبية')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {slots.isLoading ? (
              <LoadingBlock />
            ) : slots.isError ? (
              <ErrorState message={errorMessage(slots.error)} onRetry={() => void slots.refetch()} />
            ) : slotRows.length === 0 ? (
              <EmptyState
                title={t('لا توجد مواعيد')}
                description={t('أضف موعدًا ليتمكن طلابك من طلب الحجز.')}
                icon={<CalendarClock className="h-6 w-6" />}
                action={
                  <Button onClick={() => setOpen(true)}>{t('إضافة موعد')}</Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {slotRows.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-bold text-ink-900">
                        {t(WEEKDAYS[slot.weekday])} · {formatTime(slot.start_time)} — {formatTime(slot.end_time)}
                      </p>
                      <p className="text-xs text-ink-500">{slot.location ?? t('المكتب')}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge tone={slot.active === false ? 'neutral' : 'success'}>
                        {slot.active === false ? t('معطّل') : t('نشط')}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => toggle.mutate(slot)}>
                        {slot.active === false ? t('تفعيل') : t('تعطيل')}
                      </Button>
                      <IconButton label={t('حذف الموعد')} onClick={() => remove.mutate(slot.id)}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle action={<Badge tone="warning">{t('{{n}} معلّق', { n: pending.length })}</Badge>}>
              {t('طلبات الطلاب')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requests.isLoading ? (
              <LoadingBlock />
            ) : requests.isError ? (
              <ErrorState message={errorMessage(requests.error)} onRetry={() => void requests.refetch()} />
            ) : requestRows.length === 0 ? (
              <EmptyState title={t('لا توجد طلبات')} description={t('ستظهر هنا طلبات الحجز من طلابك.')} />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>{t('الطالب')}</Th>
                      <Th>{t('الموعد')}</Th>
                      <Th>{t('السبب')}</Th>
                      <Th>{t('الحالة')}</Th>
                      <Th />
                    </Tr>
                  </THead>
                  <TBody>
                    {requestRows.length === 0 ? (
                      <TableEmpty colSpan={5} message={t('لا توجد طلبات.')} />
                    ) : (
                      requestRows.map((request) => {
                        const meta = REQUEST_STATUS_LABELS[request.status];
                        return (
                          <Tr key={request.id}>
                            <Td>
                              <p className="text-sm font-semibold text-ink-900">{request.student_name ?? '—'}</p>
                              <p className="font-mono text-xs text-ink-500">{request.student_code}</p>
                            </Td>
                            <Td className="text-xs">
                              {t(WEEKDAYS[request.weekday])} · {formatTime(request.start_time)}
                            </Td>
                            <Td className="max-w-[12rem] text-xs text-ink-600">{request.reason ?? '—'}</Td>
                            <Td>
                              <Badge tone={(meta?.tone as never) ?? 'neutral'}>{t(meta?.ar ?? request.status)}</Badge>
                              <p className="mt-1 text-[10px] text-ink-400">{formatDate(request.created_at)}</p>
                            </Td>
                            <Td>
                              {request.status === 'pending' ? (
                                <div className="flex items-center gap-1">
                                  <IconButton
                                    label={t('قبول الطلب')}
                                    onClick={() => decide.mutate({ id: request.id, status: 'approved' })}
                                  >
                                    <Check className="h-4 w-4 text-emerald-600" />
                                  </IconButton>
                                  <IconButton
                                    label={t('رفض الطلب')}
                                    onClick={() => decide.mutate({ id: request.id, status: 'rejected' })}
                                  >
                                    <X className="h-4 w-4 text-danger" />
                                  </IconButton>
                                </div>
                              ) : (
                                <span className="text-[11px] text-ink-400">—</span>
                              )}
                            </Td>
                          </Tr>
                        );
                      })
                    )}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('إضافة ساعة مكتبية')}
        description={t('حدد اليوم والوقت والمكان. يجب أن يسبق وقت البداية وقت النهاية.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={startTime >= endTime}
              icon={<Plus className="h-4 w-4" />}
            >
              {t('إضافة الموعد')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <Select
            label={t('اليوم')}
            value={weekday}
            onChange={(event) => setWeekday(event.target.value)}
            options={WEEKDAYS.map((label, value) => ({ value: String(value), label: t(label) }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t('من')}
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              required
            />
            <Input
              label={t('إلى')}
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              required
              error={startTime >= endTime ? t('وقت البداية يجب أن يسبق النهاية') : undefined}
            />
          </div>
          <Input
            label={t('المكان (اختياري)')}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            maxLength={200}
            placeholder={t('مكتب 204 — مبنى الكلية')}
          />
        </div>
      </Modal>
    </div>
  );
}
