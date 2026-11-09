import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileWarning } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { ImportJob, ImportRowError } from '../../lib/types';
import { formatDate, formatInt } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { KeyValue, ProgressBar } from '../../components/ui/Page';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

export function AdminImportDetailPage() {
  const { id = '' } = useParams();

  const job = useQuery({
    queryKey: ['admin', 'import', id],
    queryFn: () => api<{ data: ImportJob }>(`/admin/imports/${id}`),
    enabled: Boolean(id),
  });
  const errors = useQuery({
    queryKey: ['admin', 'import', id, 'errors'],
    queryFn: () => api<{ data: ImportRowError[] }>(`/admin/imports/${id}/errors`),
    enabled: Boolean(id),
  });

  if (job.isLoading) return <LoadingBlock label="جارٍ تحميل تقرير الاستيراد…" />;
  if (job.isError || !job.data) {
    return <ErrorState message={errorMessage(job.error)} onRetry={() => void job.refetch()} />;
  }

  const data = job.data.data;
  const errorRows = errors.data?.data ?? [];
  const processed = data.success_rows + data.error_rows;

  return (
    <div>
      <Link
        to="/admin/imports"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowRight className="h-4 w-4" /> كل عمليات الاستيراد
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-700">تقرير الاستيراد</p>
          <h1 className="truncate font-display text-2xl font-extrabold leading-tight text-ink-950 sm:text-3xl" dir="ltr">
            {data.filename}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {data.type === 'students' ? 'ملف طلاب' : 'كشف درجات'} · {formatDate(data.created_at, true)}
          </p>
        </div>
        <Badge
          tone={
            data.status === 'completed' ? 'success' : data.status === 'failed' ? 'danger' : 'info'
          }
        >
          {data.status === 'completed'
            ? 'مكتملة'
            : data.status === 'failed'
              ? 'فاشلة'
              : data.status === 'processing'
                ? 'قيد المعالجة'
                : 'بانتظار'}
        </Badge>
      </div>

      {data.error_message && <Alert tone="danger" className="mb-4">{data.error_message}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>الملخص</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar
              value={processed}
              max={Math.max(1, data.total_rows)}
              label="الصفوف المعالجة"
              tone={data.error_rows > 0 ? 'gold' : 'success'}
            />
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="font-display text-2xl font-extrabold">{formatInt(data.total_rows)}</p>
                <p className="text-[11px] text-ink-500">إجمالي الصفوف</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="font-display text-2xl font-extrabold text-emerald-700">{formatInt(data.success_rows)}</p>
                <p className="text-[11px] text-emerald-700">نجحت</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="font-display text-2xl font-extrabold text-danger">{formatInt(data.error_rows)}</p>
                <p className="text-[11px] text-red-700">فشلت</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>التوقيت</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label="أُنشئت" value={formatDate(data.created_at, true)} />
              <KeyValue label="بدأت" value={data.started_at ? formatDate(data.started_at, true) : '—'} />
              <KeyValue label="انتهت" value={data.finished_at ? formatDate(data.finished_at, true) : '—'} />
              <KeyValue label="معرّف العملية" value={<span className="font-mono text-[10px]">{data.id}</span>} />
              <KeyValue label="بواسطة" value={<span className="font-mono text-[10px]">{data.created_by}</span>} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle
              action={
                <span className="text-xs text-ink-500">
                  {formatInt(errorRows.length)} خطأ
                </span>
              }
            >
              أخطاء الصفوف
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errors.isLoading ? (
              <LoadingBlock />
            ) : errors.isError ? (
              <ErrorState message={errorMessage(errors.error)} onRetry={() => void errors.refetch()} />
            ) : errorRows.length === 0 ? (
              <EmptyState
                title="لا توجد أخطاء"
                description="كل الصفوف عولجت بنجاح."
                icon={<FileWarning className="h-6 w-6" />}
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>الصف</Th>
                      <Th>الكود</Th>
                      <Th>السبب</Th>
                      <Th>البيانات الأصلية</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {errorRows.map((row) => (
                      <Tr key={row.id}>
                        <Td className="font-mono text-xs font-bold">{formatInt(row.row_no)}</Td>
                        <Td className="font-mono text-xs">{row.code ?? '—'}</Td>
                        <Td className="text-sm text-ink-800" dir="ltr">
                          {row.message}
                        </Td>
                        <Td>
                          <pre
                            className="max-w-xs overflow-auto rounded-lg bg-ink-950 p-2 text-[10px] leading-4 text-ink-100"
                            dir="ltr"
                          >
                            {JSON.stringify(row.raw, null, 2)}
                          </pre>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
