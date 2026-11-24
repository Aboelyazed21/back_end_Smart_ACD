import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

  if (job.isLoading) return <LoadingBlock label={t('جارٍ تحميل تقرير الاستيراد…')} />;
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
        <ArrowRight className="h-4 w-4" /> {t('كل عمليات الاستيراد')}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-700">{t('تقرير الاستيراد')}</p>
          <h1 className="truncate font-display text-2xl font-extrabold leading-tight text-ink-950 sm:text-3xl" dir="ltr">
            {data.filename}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {data.type === 'students' ? t('ملف طلاب') : t('كشف درجات')} · {formatDate(data.created_at, true)}
          </p>
        </div>
        <Badge
          tone={
            data.status === 'completed' ? 'success' : data.status === 'failed' ? 'danger' : 'info'
          }
        >
          {data.status === 'completed'
            ? t('مكتملة')
            : data.status === 'failed'
              ? t('فاشلة')
              : data.status === 'processing'
                ? t('قيد المعالجة')
                : t('بانتظار')}
        </Badge>
      </div>

      {data.error_message && <Alert tone="danger" className="mb-4">{data.error_message}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('الملخص')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar
              value={processed}
              max={Math.max(1, data.total_rows)}
              label={t('الصفوف المعالجة')}
              tone={data.error_rows > 0 ? 'gold' : 'success'}
            />
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="font-display text-2xl font-extrabold">{formatInt(data.total_rows)}</p>
                <p className="text-[11px] text-ink-500">{t('إجمالي الصفوف')}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="font-display text-2xl font-extrabold text-emerald-700">{formatInt(data.success_rows)}</p>
                <p className="text-[11px] text-emerald-700">{t('نجحت')}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="font-display text-2xl font-extrabold text-danger">{formatInt(data.error_rows)}</p>
                <p className="text-[11px] text-red-700">{t('فشلت')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('التوقيت')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label={t('أُنشئت')} value={formatDate(data.created_at, true)} />
              <KeyValue label={t('بدأت')} value={data.started_at ? formatDate(data.started_at, true) : '—'} />
              <KeyValue label={t('انتهت')} value={data.finished_at ? formatDate(data.finished_at, true) : '—'} />
              <KeyValue
                label={t('معرّف العملية')}
                value={<span className="font-mono text-[10px]">{data.id}</span>}
              />
              <KeyValue label={t('بواسطة')} value={<span className="font-mono text-[10px]">{data.created_by}</span>} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle
              action={
                <span className="text-xs text-ink-500">
                  {t('{{n}} خطأ', { n: formatInt(errorRows.length) })}
                </span>
              }
            >
              {t('أخطاء الصفوف')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errors.isLoading ? (
              <LoadingBlock />
            ) : errors.isError ? (
              <ErrorState message={errorMessage(errors.error)} onRetry={() => void errors.refetch()} />
            ) : errorRows.length === 0 ? (
              <EmptyState
                title={t('لا توجد أخطاء')}
                description={t('كل الصفوف عولجت بنجاح.')}
                icon={<FileWarning className="h-6 w-6" />}
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>{t('الصف')}</Th>
                      <Th>{t('الكود')}</Th>
                      <Th>{t('السبب')}</Th>
                      <Th>{t('البيانات الأصلية')}</Th>
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
                            className="max-w-xs overflow-auto rounded-lg bg-code p-2 text-[10px] leading-4 text-code-fg"
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
