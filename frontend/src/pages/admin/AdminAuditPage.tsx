import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { AuditLogRow, Paginated } from '../../lib/types';
import { formatDate, humanize } from '../../lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

const ENTITY_TYPES = [
  'user',
  'student',
  'advisor',
  'department',
  'course',
  'course_prerequisite',
  'course_offering',
  'data_anomaly',
  'escalation',
  'study_plan',
  'import_job',
  'auth',
];

export function AdminAuditPage() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'audit', entityType, action, entityId, from, to, page],
    queryFn: () =>
      api<Paginated<AuditLogRow>>(
        `/admin/audit-logs${qs({
          entityType: entityType || undefined,
          action: action.trim() || undefined,
          entityId: entityId.trim() || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
          page,
          limit: 20,
        })}`,
      ),
  });

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="سجل التدقيق"
        title="سجل غير قابل للتعديل"
        description="كل إجراء إداري أو أكاديمي يُسجّل هنا مع المنفّذ والوقت وعنوان IP ومعرّف الترابط. السجل مُلحق فقط (append-only) ولا يمكن تعديله أو حذفه."
      />

      <Card className="mb-4">
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              void query.refetch();
            }}
          >
            <Input
              label="نوع الكيان"
              dir="ltr"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="user"
              list="audit-entity-types"
              leading={<Search className="h-4 w-4" />}
            />
            <datalist id="audit-entity-types">
              {ENTITY_TYPES.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <Input
              label="الإجراء"
              dir="ltr"
              value={action}
              onChange={(event) => setAction(event.target.value.toUpperCase())}
              placeholder="USER_UPDATED"
            />
            <Input
              label="معرّف الكيان"
              dir="ltr"
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              placeholder="UUID"
            />
            <Input
              label="من"
              type="datetime-local"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
            <Input
              label="إلى"
              type="datetime-local"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full">
                تطبيق
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="لا توجد سجلات"
          description="جرّب توسيع نطاق التاريخ أو إزالة عوامل التصفية."
          icon={<ScrollText className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>الوقت</Th>
                    <Th>المنفّذ</Th>
                    <Th>الإجراء</Th>
                    <Th>الكيان</Th>
                    <Th>IP</Th>
                    <Th>التفاصيل</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <Tr key={row.id}>
                      <Td className="whitespace-nowrap text-xs">{formatDate(row.created_at, true)}</Td>
                      <Td>
                        <p className="text-sm font-semibold text-ink-900">{row.actor_name ?? 'النظام'}</p>
                        {row.actor_id && (
                          <p className="font-mono text-[10px] text-ink-400">{row.actor_id.slice(0, 8)}…</p>
                        )}
                      </Td>
                      <Td>
                        <Badge tone="brand" className="font-mono text-[10px]">
                          {row.action}
                        </Badge>
                      </Td>
                      <Td>
                        <p className="text-xs font-semibold text-ink-700">{humanize(row.entity_type)}</p>
                        {row.entity_id && (
                          <p className="max-w-[10rem] truncate font-mono text-[10px] text-ink-400">{row.entity_id}</p>
                        )}
                      </Td>
                      <Td className="font-mono text-[11px] text-ink-500" dir="ltr">
                        {row.ip ?? '—'}
                      </Td>
                      <Td>
                        <details className="max-w-xs">
                          <summary className="cursor-pointer text-xs font-semibold text-brand-700">عرض JSON</summary>
                          <div className="mt-2 space-y-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase text-ink-400">before</p>
                              <pre className="max-h-40 overflow-auto rounded-lg bg-ink-950 p-2 text-[10px] leading-4 text-ink-100" dir="ltr">
                                {JSON.stringify(row.before ?? null, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-ink-400">after</p>
                              <pre className="max-h-40 overflow-auto rounded-lg bg-emerald-950 p-2 text-[10px] leading-4 text-emerald-100" dir="ltr">
                                {JSON.stringify(row.after ?? null, null, 2)}
                              </pre>
                            </div>
                            {row.correlation_id && (
                              <p className="break-all font-mono text-[10px] text-ink-400">{row.correlation_id}</p>
                            )}
                          </div>
                        </details>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            {query.data && <PaginationBar pagination={query.data.pagination} onPage={setPage} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
