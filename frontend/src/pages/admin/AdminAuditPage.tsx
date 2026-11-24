import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, ScrollText, Search } from 'lucide-react';
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
import { useToast } from '../../components/ui/Toast';

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
  const { t } = useTranslation();
  const toast = useToast();
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const filterParams = () => ({
    entityType: entityType || undefined,
    action: action.trim() || undefined,
    entityId: entityId.trim() || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
  });

  const query = useQuery({
    queryKey: ['admin', 'audit', entityType, action, entityId, from, to, page],
    queryFn: () =>
      api<Paginated<AuditLogRow>>(
        `/admin/audit-logs${qs({ ...filterParams(), page, limit: 20 })}`,
      ),
  });

  const exportCsv = async () => {
    try {
      const csv = await api<string>(`/admin/audit-logs/export${qs(filterParams())}`);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(t('تم تنزيل السجل'));
    } catch (error) {
      toast.error(t('تعذر تنزيل السجل'), errorMessage(error));
    }
  };

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={t('سجل التدقيق')}
        title={t('سجل غير قابل للتعديل')}
        description={t(
          'كل إجراء إداري أو أكاديمي يُسجّل هنا مع المنفّذ والوقت وعنوان IP ومعرّف الترابط. السجل مُلحق فقط (append-only) ولا يمكن تعديله أو حذفه.',
        )}
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
              label={t('نوع الكيان')}
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
              label={t('الإجراء')}
              dir="ltr"
              value={action}
              onChange={(event) => setAction(event.target.value.toUpperCase())}
              placeholder="USER_UPDATED"
            />
            <Input
              label={t('معرّف الكيان')}
              dir="ltr"
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              placeholder="UUID"
            />
            <Input
              label={t('من')}
              type="datetime-local"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
            <Input
              label={t('إلى')}
              type="datetime-local"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
            <div className="flex items-end gap-2">
              <Button type="submit" variant="outline" className="flex-1">
                {t('تطبيق')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void exportCsv()} icon={<Download className="h-4 w-4" />}>
                {t('تنزيل CSV')}
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
          title={t('لا توجد سجلات')}
          description={t('جرّب توسيع نطاق التاريخ أو إزالة عوامل التصفية.')}
          icon={<ScrollText className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>{t('الوقت')}</Th>
                    <Th>{t('المنفّذ')}</Th>
                    <Th>{t('الإجراء')}</Th>
                    <Th>{t('الكيان')}</Th>
                    <Th>IP</Th>
                    <Th>{t('التفاصيل')}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((row) => {
                    const hasPayload = Boolean(row.before || row.after);
                    return (
                      <Tr key={row.id}>
                        <Td className="whitespace-nowrap text-xs">{formatDate(row.created_at, true)}</Td>
                        <Td>
                          <p className="text-sm font-semibold text-ink-900">{row.actor_name ?? t('النظام')}</p>
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
                          {hasPayload ? (
                            <details className="max-w-xs">
                              <summary className="cursor-pointer text-xs font-semibold text-brand-700">
                                {t('عرض JSON')}
                              </summary>
                              <div className="mt-2 space-y-2">
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-ink-400">before</p>
                                  <pre className="max-h-40 overflow-auto rounded-lg bg-code p-2 text-[10px] leading-4 text-code-fg" dir="ltr">
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
                          ) : (
                            <div className="max-w-[12rem]">
                              <p className="text-[11px] text-ink-400">{t('لا توجد تغييرات في البيانات')}</p>
                              {row.correlation_id && (
                                <p
                                  className="truncate font-mono text-[10px] text-ink-300"
                                  dir="ltr"
                                  title={row.correlation_id}
                                >
                                  {row.correlation_id}
                                </p>
                              )}
                            </div>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
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
