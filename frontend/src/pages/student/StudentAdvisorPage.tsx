import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Clock, Mail, MapPin, UserRound } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { OfficeHourRequest, OfficeHourSlot } from '../../lib/types';
import { REQUEST_STATUS_LABELS, WEEKDAYS } from '../../lib/constants';
import { formatDate, formatTime } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

interface AdvisorPayload {
  advisor: {
    id: string;
    office_location: string | null;
    max_students: number;
    full_name: string;
    email: string;
    department: string | null;
  } | null;
  officeHours: OfficeHourSlot[];
}

export function StudentAdvisorPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OfficeHourSlot | null>(null);
  const [reason, setReason] = useState('');

  const advisorQuery = useQuery({
    queryKey: ['student', 'advisor'],
    queryFn: () => api<{ data: AdvisorPayload }>('/student/advisor'),
  });
  const requestsQuery = useQuery({
    queryKey: ['student', 'office-hour-requests'],
    queryFn: () => api<{ data: OfficeHourRequest[] }>('/student/office-hours/requests'),
  });

  const request = useMutation({
    mutationFn: () =>
      api('/student/office-hours/requests', {
        method: 'POST',
        body: { slotId: selected?.id, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }),
    onSuccess: async () => {
      toast.success('تم إرسال طلب الساعة المكتبية');
      setSelected(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['student', 'office-hour-requests'] });
    },
    onError: (error) => toast.error('تعذر إرسال الطلب', errorMessage(error)),
  });

  const grouped = useMemo(() => {
    const slots = advisorQuery.data?.data.officeHours ?? [];
    return slots.reduce<Record<number, OfficeHourSlot[]>>((accumulator, slot) => {
      (accumulator[slot.weekday] ??= []).push(slot);
      return accumulator;
    }, {});
  }, [advisorQuery.data]);

  if (advisorQuery.isLoading) return <LoadingBlock />;
  if (advisorQuery.isError || !advisorQuery.data) {
    return <ErrorState message={errorMessage(advisorQuery.error)} onRetry={() => void advisorQuery.refetch()} />;
  }

  const { advisor, officeHours } = advisorQuery.data.data;

  return (
    <div>
      <PageHeader
        eyebrow="الإرشاد الأكاديمي"
        title="مرشدي الأكاديمي والساعات المكتبية"
        description="اطلع على بيانات مرشدك، واحجز ساعة مكتبية. الطلب يخضع لموافقة المرشد."
      />

      {!advisor ? (
        <EmptyState title="لم يُسند مرشد بعد" description="تواصل مع إدارة الكلية لإسناد مرشد أكاديمي." icon={<UserRound className="h-6 w-6" />} />
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>بيانات المرشد</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                    <UserRound className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold text-ink-900">{advisor.full_name}</p>
                    <p className="truncate text-xs text-ink-500">{advisor.department ?? '—'}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-ink-600">
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-ink-400" />
                    <span dir="ltr">{advisor.email}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-ink-400" />
                    {advisor.office_location ?? 'غير محدد'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle action={<Badge tone="brand">{officeHours.length} موعد</Badge>}>الساعات المكتبية المتاحة</CardTitle>
              </CardHeader>
              <CardContent>
                {officeHours.length === 0 ? (
                  <EmptyState title="لا توجد ساعات مكتبية معلنة" icon={<CalendarClock className="h-6 w-6" />} />
                ) : (
                  <div className="space-y-3">
                    {Object.entries(grouped).map(([weekday, slots]) => (
                      <div key={weekday}>
                        <p className="mb-1.5 text-xs font-bold text-ink-500">{WEEKDAYS[Number(weekday)]}</p>
                        <div className="flex flex-wrap gap-2">
                          {slots.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelected(slot)}
                              className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-start transition hover:border-brand-400 hover:bg-brand-50/40"
                            >
                              <span className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                                <Clock className="h-4 w-4 text-brand-600" />
                                {formatTime(slot.start_time)} — {formatTime(slot.end_time)}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-ink-500">{slot.location ?? 'المكتب'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle action={<Badge tone="neutral">{requestsQuery.data?.data.length ?? 0}</Badge>}>طلباتي</CardTitle>
            </CardHeader>
            <CardContent>
              {requestsQuery.isLoading ? (
                <LoadingBlock />
              ) : requestsQuery.isError ? (
                <ErrorState message={errorMessage(requestsQuery.error)} onRetry={() => void requestsQuery.refetch()} />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <Tr>
                        <Th>الموعد</Th>
                        <Th>المكان</Th>
                        <Th>السبب</Th>
                        <Th>الحالة</Th>
                        <Th>تاريخ الطلب</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {(requestsQuery.data?.data.length ?? 0) === 0 ? (
                        <TableEmpty colSpan={5} message="لم تقدّم أي طلبات بعد." />
                      ) : (
                        requestsQuery.data?.data.map((item) => {
                          const status = REQUEST_STATUS_LABELS[item.status];
                          return (
                            <Tr key={item.id}>
                              <Td className="text-xs">
                                {WEEKDAYS[item.weekday]} · {formatTime(item.start_time)} — {formatTime(item.end_time)}
                              </Td>
                              <Td className="text-xs">{item.location ?? '—'}</Td>
                              <Td className="max-w-xs text-xs text-ink-600">{item.reason ?? '—'}</Td>
                              <Td>
                                <Badge tone={(status?.tone as never) ?? 'neutral'}>{status?.ar ?? item.status}</Badge>
                              </Td>
                              <Td className="text-xs">{formatDate(item.created_at, true)}</Td>
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
        </>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="طلب حجز ساعة مكتبية"
        description={
          selected
            ? `${WEEKDAYS[selected.weekday]} · ${formatTime(selected.start_time)} — ${formatTime(selected.end_time)}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              إلغاء
            </Button>
            <Button onClick={() => request.mutate()} loading={request.isPending}>
              إرسال الطلب
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {request.isError && <Alert tone="danger">{errorMessage(request.error)}</Alert>}
          <Textarea
            label="سبب الزيارة (اختياري)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            placeholder="مثال: مراجعة خطة الفصل القادم…"
          />
          <Alert tone="info">لا يمكن إرسال أكثر من طلب نشط لنفس الموعد.</Alert>
        </div>
      </Modal>
    </div>
  );
}
