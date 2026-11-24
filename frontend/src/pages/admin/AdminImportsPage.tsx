import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FileSpreadsheet, Upload } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { ImportJob, Paginated } from '../../lib/types';
import { formatDate, formatInt } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

const JOB_STATUS: Record<string, { ar: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  pending: { ar: 'بانتظار المعالجة', tone: 'neutral' },
  processing: { ar: 'قيد المعالجة', tone: 'info' },
  completed: { ar: 'مكتملة', tone: 'success' },
  failed: { ar: 'فاشلة', tone: 'danger' },
};

export function AdminImportsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const studentsInput = useRef<HTMLInputElement>(null);
  const transcriptsInput = useRef<HTMLInputElement>(null);
  const [studentsFile, setStudentsFile] = useState<File | null>(null);
  const [transcriptsFile, setTranscriptsFile] = useState<File | null>(null);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'imports', type, status, page],
    queryFn: () =>
      api<Paginated<ImportJob>>(
        `/admin/imports${qs({ type: type || undefined, status: status || undefined, page, limit: 20 })}`,
      ),
  });

  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: 'students' | 'transcripts'; file: File }) => {
      const body = new FormData();
      body.append('file', file);
      return api<{ data: ImportJob }>(`/admin/imports/${kind}`, { method: 'POST', rawBody: body });
    },
    onSuccess: async (payload) => {
      toast.success(
        t('بدأت المعالجة'),
        payload.data.status === 'completed'
          ? t('اكتمل الاستيراد. راجع التقرير لتفاصيل الأخطاء.')
          : t('ستظهر النتائج في جدول العمليات.'),
      );
      setStudentsFile(null);
      setTranscriptsFile(null);
      if (studentsInput.current) studentsInput.current.value = '';
      if (transcriptsInput.current) transcriptsInput.current.value = '';
      await queryClient.invalidateQueries({ queryKey: ['admin', 'imports'] });
    },
    onError: (error) => toast.error(t('تعذر رفع الملف'), errorMessage(error)),
  });

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={t('استيراد البيانات')}
        title={t('رفع ملفات الطلاب وكشوف الدرجات')}
        description={t(
          'الملفات CSV فقط. كل صف يُتحقق منه مستقلًا؛ الصفوف الفاشلة تُسجّل بأرقامها وأسبابها ولا تُسقط بقية الملف. الاستيراد يخضع لحد معدل.',
        )}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle action={<Badge tone="brand">CSV</Badge>}>{t('ملف الطلاب')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-6 text-ink-600">
              {t('الأعمدة المطلوبة:')}{' '}
              <code className="rounded bg-ink-50 px-1 font-mono" dir="ltr">
                email, full_name, student_code, program, level, cgpa, passed_credits
              </code>
              {t('. اختياري:')}{' '}
              <code className="rounded bg-ink-50 px-1 font-mono" dir="ltr">transfer_credits, advisor_email</code>.
            </p>
            <input
              ref={studentsInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setStudentsFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-700 file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            <Button
              onClick={() => studentsFile && upload.mutate({ kind: 'students', file: studentsFile })}
              loading={upload.isPending && upload.variables?.kind === 'students'}
              disabled={!studentsFile}
              icon={<Upload className="h-4 w-4" />}
              className="w-full"
            >
              {t('رفع ملف الطلاب')}
            </Button>
            <Alert tone="warning">
              {t(
                'الحسابات المستوردة تُنشأ بكلمة مرور غير معلنة ويجب على الطالب استخدام «نسيت كلمة المرور» قبل الدخول.',
              )}
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle action={<Badge tone="gold">CSV</Badge>}>{t('ملف كشوف الدرجات')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-6 text-ink-600">
              {t('الأعمدة المطلوبة:')}{' '}
              <code className="rounded bg-ink-50 px-1 font-mono" dir="ltr">
                student_code, course_code, academic_year, season
              </code>
              {t('. مع')} <code className="rounded bg-ink-50 px-1 font-mono" dir="ltr">grade_letter</code> {t('أو')}{' '}
              <code className="rounded bg-ink-50 px-1 font-mono" dir="ltr">percentage</code>
              {t('. اختياري:')}{' '}
              <code className="rounded bg-ink-50 px-1 font-mono" dir="ltr">status, attempt_no, term</code>.
            </p>
            <input
              ref={transcriptsInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setTranscriptsFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-700 file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            <Button
              onClick={() => transcriptsFile && upload.mutate({ kind: 'transcripts', file: transcriptsFile })}
              loading={upload.isPending && upload.variables?.kind === 'transcripts'}
              disabled={!transcriptsFile}
              icon={<Upload className="h-4 w-4" />}
              className="w-full"
            >
              {t('رفع كشف الدرجات')}
            </Button>
            <Alert tone="info">
              {t('إعادة رفع نفس الصف تُحدّث السجل (student + course + term + attempt) بدل تكراره.')}
            </Alert>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink-900">{t('عمليات الاستيراد')}</h2>
        <div className="flex flex-wrap gap-2">
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            className="w-40"
            options={[
              { value: '', label: t('كل الأنواع') },
              { value: 'students', label: t('طلاب') },
              { value: 'transcripts', label: t('كشوف درجات') },
            ]}
          />
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="w-40"
            options={[
              { value: '', label: t('كل الحالات') },
              { value: 'pending', label: t('بانتظار') },
              { value: 'processing', label: t('قيد المعالجة') },
              { value: 'completed', label: t('مكتملة') },
              { value: 'failed', label: t('فاشلة') },
            ]}
          />
        </div>
      </div>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('لا توجد عمليات استيراد')}
          description={t('ارفع أول ملف CSV لبدء العملية.')}
          icon={<FileSpreadsheet className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>{t('الملف')}</Th>
                    <Th>{t('النوع')}</Th>
                    <Th>{t('الحالة')}</Th>
                    <Th>{t('الصفوف')}</Th>
                    <Th>{t('نجح')}</Th>
                    <Th>{t('فشل')}</Th>
                    <Th>{t('أُنشئت')}</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((job) => {
                    const meta = JOB_STATUS[job.status] ?? JOB_STATUS.pending;
                    return (
                      <Tr key={job.id}>
                        <Td>
                          <p className="max-w-[14rem] truncate text-sm font-semibold text-ink-900" dir="ltr">
                            {job.filename}
                          </p>
                          {job.error_message && (
                            <p className="max-w-[14rem] truncate text-[11px] text-danger">{job.error_message}</p>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={job.type === 'students' ? 'brand' : 'gold'}>
                            {job.type === 'students' ? t('طلاب') : t('كشف درجات')}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge tone={meta.tone}>{t(meta.ar)}</Badge>
                        </Td>
                        <Td>{formatInt(job.total_rows)}</Td>
                        <Td className="font-semibold text-emerald-700">{formatInt(job.success_rows)}</Td>
                        <Td className="font-semibold text-danger">{formatInt(job.error_rows)}</Td>
                        <Td className="text-xs">{formatDate(job.created_at, true)}</Td>
                        <Td>
                          <Link to={`/admin/imports/${job.id}`}>
                            <Button size="sm" variant="outline" icon={<ExternalLink className="h-4 w-4" />}>
                              {t('التقرير')}
                            </Button>
                          </Link>
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
