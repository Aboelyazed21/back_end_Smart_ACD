import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Inbox, Settings2, Ticket } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { Escalation, Paginated, User } from '../../lib/types';
import {
  ESCALATION_STATUS_LABELS,
  ESCALATION_TYPE_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
} from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { useToast } from '../../components/ui/Toast';

type Status = 'open' | 'in_review' | 'resolved' | 'closed';
type Priority = 'low' | 'medium' | 'high' | 'critical';

export function AdminEscalationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Escalation | null>(null);
  const [nextStatus, setNextStatus] = useState<Status>('in_review');
  const [nextPriority, setNextPriority] = useState<Priority>('medium');
  const [resolution, setResolution] = useState('');
  const [assignee, setAssignee] = useState('none');

  const query = useQuery({
    queryKey: ['admin', 'escalations', status, type, priority, page],
    queryFn: () =>
      api<Paginated<Escalation>>(
        `/admin/escalations${qs({
          status: status || undefined,
          type: type || undefined,
          priority: priority || undefined,
          page,
          limit: 20,
        })}`,
      ),
  });

  const advisors = useQuery({
    queryKey: ['admin', 'users', 'assignees', 'advisor'],
    queryFn: () => api<Paginated<User>>('/admin/users?role=advisor&limit=100'),
    staleTime: 60_000,
  });
  const admins = useQuery({
    queryKey: ['admin', 'users', 'assignees', 'admin'],
    queryFn: () => api<Paginated<User>>('/admin/users?role=admin&limit=100'),
    staleTime: 60_000,
  });

  const assigneeOptions = useMemo(
    () => [
      { value: 'none', label: t('بدون إسناد') },
      ...(advisors.data?.data ?? []).map((user) => ({
        value: user.id,
        label: `${user.fullName} — ${t(ROLE_LABELS[user.role])}`,
      })),
      ...(admins.data?.data ?? []).map((user) => ({
        value: user.id,
        label: `${user.fullName} — ${t(ROLE_LABELS[user.role])}`,
      })),
    ],
    [advisors.data, admins.data, t],
  );

  const update = useMutation({
    mutationFn: () =>
      api(`/admin/escalations/${selected?.id}`, {
        method: 'PATCH',
        body: {
          status: nextStatus,
          priority: nextPriority,
          ...(resolution.trim().length >= 3 ? { resolution: resolution.trim() } : {}),
          assignedTo: assignee === 'none' ? null : assignee,
        },
      }),
    onSuccess: async () => {
      toast.success(t('تم تحديث الحالة'));
      setSelected(null);
      setResolution('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'escalations'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] });
    },
    onError: (error) => toast.error(t('تعذر تحديث الحالة'), errorMessage(error)),
  });

  const openDetail = (row: Escalation) => {
    setSelected(row);
    setNextStatus(row.status);
    setNextPriority(row.priority);
    setResolution(row.resolution ?? '');
    setAssignee(row.assigned_to ?? 'none');
  };

  const rows = query.data?.data ?? [];
  const requiresResolution = (nextStatus === 'resolved' || nextStatus === 'closed') && resolution.trim().length < 3;

  return (
    <div>
      <PageHeader
        eyebrow={t('الحالات المحوّلة')}
        title={t('إدارة الحالات الأكاديمية')}
        description={t(
          'الحالات الناتجة عن محرك القواعد، مراجعة الخطط، التعارضات، أو طلبات الطلاب. الإسناد والحل موثّقان في سجل التدقيق.',
        )}
      />

      <Card className="mb-4">
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label={t('الحالة')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: t('الكل') },
                { value: 'open', label: t('مفتوحة') },
                { value: 'in_review', label: t('قيد المراجعة') },
                { value: 'resolved', label: t('محلولة') },
                { value: 'closed', label: t('مغلقة') },
              ]}
            />
            <Select
              label={t('النوع')}
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: t('كل الأنواع') },
                ...Object.entries(ESCALATION_TYPE_LABELS).map(([value, label]) => ({ value, label: t(label) })),
              ]}
            />
            <Select
              label={t('الأولوية')}
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: t('كل الأولويات') },
                { value: 'low', label: t('منخفضة') },
                { value: 'medium', label: t('متوسطة') },
                { value: 'high', label: t('عالية') },
                { value: 'critical', label: t('حرجة') },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('لا توجد حالات')}
          description={t('لا توجد حالات مطابقة لعوامل التصفية.')}
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
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-brand-700">
                        <Ticket className="h-3.5 w-3.5" /> {row.ticket_no}
                      </span>
                      <Badge tone={(statusMeta?.tone as never) ?? 'neutral'}>
                        {t(statusMeta?.ar ?? row.status)}
                      </Badge>
                      <Badge tone={(priorityMeta?.tone as never) ?? 'neutral'}>
                        {t(priorityMeta?.ar ?? row.priority)}
                      </Badge>
                      <Badge tone="neutral">{t(ESCALATION_TYPE_LABELS[row.type] ?? row.type)}</Badge>
                      {row.assigned_to ? (
                        <Badge tone="info">{row.assignee_name ?? t('مسند')}</Badge>
                      ) : (
                        <Badge tone="warning">{t('غير مسند')}</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-bold text-ink-900">{row.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-600">{row.description}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
                      <span>
                        {row.student_name ?? '—'} {row.student_code ? `· ${row.student_code}` : ''}
                      </span>
                      <span>· {formatDate(row.created_at, true)}</span>
                      {row.related_course_code && (
                        <Badge tone="brand" className="font-mono text-[10px]">
                          {row.related_course_code}
                        </Badge>
                      )}
                    </div>
                    {row.anomaly_ids.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {row.anomaly_ids.map((id) => (
                          <Link key={id} to={`/admin/anomalies/${id}`}>
                            <Badge tone="warning" className="font-mono text-[10px]">
                              {id}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    )}
                    {row.resolution && (
                      <div className="mt-2 rounded-lg bg-ink-50 p-2.5 text-xs leading-5 text-ink-700">
                        <span className="font-bold">{t('الحل:')} </span>
                        {row.resolution}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDetail(row)}
                    icon={<Settings2 className="h-4 w-4" />}
                  >
                    {t('إدارة الحالة')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {query.data && <PaginationBar pagination={query.data.pagination} onPage={setPage} className="mt-3" />}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          selected ? t('إدارة {{ticket}}', { ticket: selected.ticket_no }) : t('إدارة الحالة')
        }
        description={t('الإسناد متاح للمرشدين والمسؤولين النشطين فقط. الحل أو الإغلاق يتطلب ملخصًا مكتوبًا.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => update.mutate()} loading={update.isPending} disabled={requiresResolution}>
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
              onChange={(event) => setNextStatus(event.target.value as Status)}
              options={[
                { value: 'open', label: t('مفتوحة') },
                { value: 'in_review', label: t('قيد المراجعة') },
                { value: 'resolved', label: t('محلولة') },
                { value: 'closed', label: t('مغلقة') },
              ]}
            />
            <Select
              label={t('الأولوية')}
              value={nextPriority}
              onChange={(event) => setNextPriority(event.target.value as Priority)}
              options={[
                { value: 'low', label: t('منخفضة') },
                { value: 'medium', label: t('متوسطة') },
                { value: 'high', label: t('عالية') },
                { value: 'critical', label: t('حرجة') },
              ]}
            />
          </div>
          <Select
            label={t('الإسناد')}
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            options={assigneeOptions}
          />
          <Textarea
            label={t('ملخص الإجراء / الحل')}
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            maxLength={5000}
            placeholder={t('ما الذي تم فعله؟ ما القرار؟ ما الخطوات التالية؟')}
            error={
              requiresResolution ? t('الحل أو الإغلاق يتطلب 3 أحرف على الأقل') : undefined
            }
          />
          {selected && (
            <div className="rounded-xl bg-ink-50 p-3 text-xs leading-5 text-ink-600">
              <p className="font-bold text-ink-800">{selected.subject}</p>
              <p className="mt-1">{selected.description}</p>
              {selected.related_plan_id && (
                <p className="mt-1 font-mono text-[10px] text-ink-400">
                  {t('خطة:')} {selected.related_plan_id}
                </p>
              )}
            </div>
          )}
          <Alert tone="info">{t('كل تحديث يُسجّل في سجل التدقيق مع هوية المنفّذ والوقت.')}</Alert>
        </div>
      </Modal>
    </div>
  );
}
