import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
      { value: 'none', label: 'بدون إسناد' },
      ...(advisors.data?.data ?? []).map((user) => ({
        value: user.id,
        label: `${user.fullName} — ${ROLE_LABELS[user.role]}`,
      })),
      ...(admins.data?.data ?? []).map((user) => ({
        value: user.id,
        label: `${user.fullName} — ${ROLE_LABELS[user.role]}`,
      })),
    ],
    [advisors.data, admins.data],
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
      toast.success('تم تحديث الحالة');
      setSelected(null);
      setResolution('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'escalations'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] });
    },
    onError: (error) => toast.error('تعذر تحديث الحالة', errorMessage(error)),
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
        eyebrow="الحالات المحوّلة"
        title="إدارة الحالات الأكاديمية"
        description="الحالات الناتجة عن محرك القواعد، مراجعة الخطط، التعارضات، أو طلبات الطلاب. الإسناد والحل موثّقان في سجل التدقيق."
      />

      <Card className="mb-4">
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="الحالة"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'الكل' },
                { value: 'open', label: 'مفتوحة' },
                { value: 'in_review', label: 'قيد المراجعة' },
                { value: 'resolved', label: 'محلولة' },
                { value: 'closed', label: 'مغلقة' },
              ]}
            />
            <Select
              label="النوع"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'كل الأنواع' },
                ...Object.entries(ESCALATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
            <Select
              label="الأولوية"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'كل الأولويات' },
                { value: 'low', label: 'منخفضة' },
                { value: 'medium', label: 'متوسطة' },
                { value: 'high', label: 'عالية' },
                { value: 'critical', label: 'حرجة' },
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
          title="لا توجد حالات"
          description="لا توجد حالات مطابقة لعوامل التصفية."
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
                      <Badge tone={(statusMeta?.tone as never) ?? 'neutral'}>{statusMeta?.ar ?? row.status}</Badge>
                      <Badge tone={(priorityMeta?.tone as never) ?? 'neutral'}>{priorityMeta?.ar ?? row.priority}</Badge>
                      <Badge tone="neutral">{ESCALATION_TYPE_LABELS[row.type] ?? row.type}</Badge>
                      {row.assigned_to ? (
                        <Badge tone="info">{row.assignee_name ?? 'مسند'}</Badge>
                      ) : (
                        <Badge tone="warning">غير مسند</Badge>
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
                        <span className="font-bold">الحل: </span>
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
                    إدارة الحالة
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
        title={selected ? `إدارة ${selected.ticket_no}` : 'إدارة الحالة'}
        description="الإسناد متاح للمرشدين والمسؤولين النشطين فقط. الحل أو الإغلاق يتطلب ملخصًا مكتوبًا."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              إلغاء
            </Button>
            <Button onClick={() => update.mutate()} loading={update.isPending} disabled={requiresResolution}>
              حفظ التحديث
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="الحالة"
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as Status)}
              options={[
                { value: 'open', label: 'مفتوحة' },
                { value: 'in_review', label: 'قيد المراجعة' },
                { value: 'resolved', label: 'محلولة' },
                { value: 'closed', label: 'مغلقة' },
              ]}
            />
            <Select
              label="الأولوية"
              value={nextPriority}
              onChange={(event) => setNextPriority(event.target.value as Priority)}
              options={[
                { value: 'low', label: 'منخفضة' },
                { value: 'medium', label: 'متوسطة' },
                { value: 'high', label: 'عالية' },
                { value: 'critical', label: 'حرجة' },
              ]}
            />
          </div>
          <Select
            label="الإسناد"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            options={assigneeOptions}
          />
          <Textarea
            label="ملخص الإجراء / الحل"
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            maxLength={5000}
            placeholder="ما الذي تم فعله؟ ما القرار؟ ما الخطوات التالية؟"
            error={requiresResolution ? 'الحل أو الإغلاق يتطلب 3 أحرف على الأقل' : undefined}
          />
          {selected && (
            <div className="rounded-xl bg-ink-50 p-3 text-xs leading-5 text-ink-600">
              <p className="font-bold text-ink-800">{selected.subject}</p>
              <p className="mt-1">{selected.description}</p>
              {selected.related_plan_id && (
                <p className="mt-1 font-mono text-[10px] text-ink-400">خطة: {selected.related_plan_id}</p>
              )}
            </div>
          )}
          <Alert tone="info">كل تحديث يُسجّل في سجل التدقيق مع هوية المنفّذ والوقت.</Alert>
        </div>
      </Modal>
    </div>
  );
}
