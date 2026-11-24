import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Inbox, MessageSquare, Ticket } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { Escalation } from '../../lib/types';
import {
  ESCALATION_STATUS_LABELS,
  ESCALATION_TYPE_LABELS,
  PRIORITY_LABELS,
} from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { useToast } from '../../components/ui/Toast';

export function AdvisorEscalationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Escalation | null>(null);
  const [nextStatus, setNextStatus] = useState<'open' | 'in_review' | 'resolved' | 'closed'>('in_review');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [resolution, setResolution] = useState('');

  const query = useQuery({
    queryKey: ['advisor', 'escalations', status],
    queryFn: () =>
      api<{ data: Escalation[] }>(`/advisor/escalations${qs({ status: status || undefined })}`),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/advisor/escalations/${selected?.id}`, {
        method: 'PATCH',
        body: {
          status: nextStatus,
          priority,
          ...(resolution.trim().length >= 3 ? { resolution: resolution.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success(t('تم تحديث الحالة'));
      setSelected(null);
      setResolution('');
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'escalations'] });
      await queryClient.invalidateQueries({ queryKey: ['advisor', 'dashboard'] });
    },
    onError: (error) => toast.error(t('تعذر تحديث الحالة'), errorMessage(error)),
  });

  const rows = query.data?.data ?? [];

  const openDetail = (row: Escalation) => {
    setSelected(row);
    setNextStatus(row.status);
    setPriority(row.priority);
    setResolution(row.resolution ?? '');
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('الحالات المحوّلة')}
        title={t('الحالات الأكاديمية المفتوحة')}
        description={t('الحالات التي أنشأها محرك القواعد أو الطلاب أو المسؤولون لطلابك. حلّ الحالة يتطلب توثيق الإجراء.')}
        actions={
          <Select
            label={t('الحالة')}
            className="w-44"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: '', label: t('الكل') },
              { value: 'open', label: t('مفتوحة') },
              { value: 'in_review', label: t('قيد المراجعة') },
              { value: 'resolved', label: t('محلولة') },
              { value: 'closed', label: t('مغلقة') },
            ]}
          />
        }
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('لا توجد حالات')}
          description={t('لا توجد حالات مطابقة للفلتر الحالي.')}
          icon={<Inbox className="h-6 w-6" />}
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const statusMeta = ESCALATION_STATUS_LABELS[row.status];
            const priorityMeta = PRIORITY_LABELS[row.priority];
            return (
              <Card key={row.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-brand-700">
                        <Ticket className="h-3.5 w-3.5" /> {row.ticket_no}
                      </span>
                      <Badge tone={(statusMeta?.tone as never) ?? 'neutral'}>{t(statusMeta?.ar ?? row.status)}</Badge>
                      <Badge tone={(priorityMeta?.tone as never) ?? 'neutral'}>{t(priorityMeta?.ar ?? row.priority)}</Badge>
                      <Badge tone="neutral">{t(ESCALATION_TYPE_LABELS[row.type] ?? row.type)}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-bold text-ink-900">{row.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-600">{row.description}</p>
                    <p className="mt-1 text-[11px] text-ink-400">
                      {row.student_name ?? ''} {row.student_code ? `· ${row.student_code}` : ''} ·{' '}
                      {formatDate(row.created_at, true)}
                    </p>
                    {row.anomaly_ids?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.anomaly_ids.map((id) => (
                          <Badge key={id} tone="warning" className="font-mono text-[10px]">
                            {id}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDetail(row)}
                    icon={<MessageSquare className="h-4 w-4" />}
                  >
                    {t('تحديث الحالة')}
                  </Button>
                </div>
                {row.resolution && (
                  <div className="mt-3 rounded-lg bg-ink-50 p-2.5 text-xs leading-5 text-ink-700">
                    <span className="font-bold">{t('الحل')}: </span>
                    {row.resolution}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? t('تحديث {{ticket}}', { ticket: selected.ticket_no }) : t('تحديث الحالة')}
        description={t('اختر الحالة والأولوية. عند الحل يجب كتابة ملخص الإجراء (3 أحرف على الأقل).')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => update.mutate()}
              loading={update.isPending}
              disabled={(nextStatus === 'resolved' || nextStatus === 'closed') && resolution.trim().length < 3}
            >
              {t('حفظ التحديث')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t('الحالة')}
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as typeof nextStatus)}
              options={[
                { value: 'open', label: t('مفتوحة') },
                { value: 'in_review', label: t('قيد المراجعة') },
                { value: 'resolved', label: t('محلولة') },
                { value: 'closed', label: t('مغلقة') },
              ]}
            />
            <Select
              label={t('الأولوية')}
              value={priority}
              onChange={(event) => setPriority(event.target.value as typeof priority)}
              options={[
                { value: 'low', label: t('منخفضة') },
                { value: 'medium', label: t('متوسطة') },
                { value: 'high', label: t('عالية') },
                { value: 'critical', label: t('حرجة') },
              ]}
            />
          </div>
          <Textarea
            label={t('ملخص الإجراء / الحل')}
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            maxLength={5000}
            placeholder={t('ما الذي تم فعله؟ ما القرار؟ ما الخطوات التالية للطالب؟')}
          />
          <Alert tone="info">{t('كل تحديث يُسجّل في سجل التدقيق مع هوية المنفّذ والوقت.')}</Alert>
        </div>
      </Modal>
    </div>
  );
}
