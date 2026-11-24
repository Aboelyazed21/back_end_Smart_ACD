import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { Enrollment, GpaResult } from '../../lib/types';
import { formatInt, formatNumber, currentTermValue } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { PageHeader, StatCard } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { TermSelect } from '../../components/ui/PaginationBar';

interface SimRow {
  id: number;
  courseCode: string;
  nameEn: string;
  nameAr: string;
  credits: number;
  percentage: string;
  gradeLetter: string;
}

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];

let rowSeed = 1;
const toRow = (course: Enrollment): SimRow => ({
  id: rowSeed++,
  courseCode: course.courseCode,
  nameEn: course.nameEn,
  nameAr: course.nameAr,
  credits: course.credits,
  percentage: '',
  gradeLetter: '',
});

/** One row per course registered in the semester, keeping the latest attempt. */
function uniqueRegisteredCourses(rows: Enrollment[]): Enrollment[] {
  const byCode = new Map<string, Enrollment>();
  for (const row of rows) {
    const current = byCode.get(row.courseCode);
    if (!current || row.attemptNo >= current.attemptNo) byCode.set(row.courseCode, row);
  }
  return [...byCode.values()].sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

export function GpaSimulatorPage() {
  const { t, i18n } = useTranslation();
  const [term, setTerm] = useState(currentTermValue());
  const [rows, setRows] = useState<SimRow[]>([]);
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<GpaResult | null>(null);
  const initializedTerm = useRef<string | null>(null);

  const projected = result?.projected;
  const classificationLabel = projected
    ? Array.isArray(projected.classification)
      ? i18n.language?.startsWith('ar')
        ? projected.classification[1]
        : projected.classification_en ?? projected.classification[1]
      : projected.classification
    : '';

  const enrollmentsQuery = useQuery({
    queryKey: ['student', 'enrollments', term],
    queryFn: () => api<{ data: Enrollment[] }>(`/student/enrollments${qs({ term })}`),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const registered = useMemo(
    () => uniqueRegisteredCourses(enrollmentsQuery.data?.data ?? []),
    [enrollmentsQuery.data],
  );
  const registeredCredits = registered.reduce((sum, course) => sum + course.credits, 0);

  useEffect(() => {
    if (!enrollmentsQuery.data || initializedTerm.current === term) return;
    initializedTerm.current = term;
    setRows(registered.map(toRow));
    setResult(null);
  }, [enrollmentsQuery.data, registered, term]);

  const changeTerm = (value: string) => {
    initializedTerm.current = null;
    setRows([]);
    setResult(null);
    setTerm(value);
  };

  const unusedCourses = registered.filter(
    (course) => !rows.some((row) => row.courseCode === course.courseCode),
  );

  const addCourse = () => {
    const next = unusedCourses[0];
    if (next) setRows((current) => [...current, toRow(next)]);
  };

  const update = (id: number, patch: Partial<SimRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const canRun = rows.some((row) => row.percentage !== '' || row.gradeLetter !== '');

  const mutation = useMutation({
    mutationFn: () => {
      const simulated = rows
        .filter((row) => row.percentage !== '' || row.gradeLetter !== '')
        .map((row) => ({
          courseCode: row.courseCode,
          ...(row.percentage !== '' ? { percentage: Number(row.percentage) } : {}),
          ...(row.gradeLetter ? { gradeLetter: row.gradeLetter } : {}),
        }));
      return api<{ data: GpaResult }>('/student/gpa/simulate', {
        method: 'POST',
        body: {
          term,
          simulated,
          ...(target !== '' ? { futureCgpaTarget: Number(target) } : {}),
        },
      });
    },
    onSuccess: (data) => setResult(data.data),
  });

  return (
    <div>
      <PageHeader
        eyebrow={t('محاكاة المعدل')}
        title={t('ماذا لو حصلت على هذه الدرجات؟')}
        description={t(
          'محاكاة استشارية لحساب المعدل الفصلي والتراكمي وفق أوزان الساعات وقواعد الإعادة. لا تُحدّث أي درجة رسمية.',
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCourse}
                  icon={<Plus className="h-4 w-4" />}
                  disabled={unusedCourses.length === 0 || rows.length >= 30}
                >
                  {t('إضافة مقرر')}
                </Button>
              }
            >
              {t('المقررات والدرجات المتوقعة')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TermSelect value={term} onChange={changeTerm} label={t('الفصل')} />
              <Input
                label={t('المعدل التراكمي المستهدف (اختياري)')}
                type="number"
                min={0}
                max={4}
                step="0.01"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                hint="0 – 4.00"
              />
            </div>

            {enrollmentsQuery.isLoading ? (
              <LoadingBlock />
            ) : enrollmentsQuery.isError ? (
              <ErrorState
                message={errorMessage(enrollmentsQuery.error)}
                onRetry={() => void enrollmentsQuery.refetch()}
              />
            ) : registered.length === 0 ? (
              <Alert tone="info">
                {t('لا توجد مقررات مسجلة في هذا الفصل. اختر فصلاً آخر أو راجع سجلك الأكاديمي.')}
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/60 px-3 py-2 text-xs font-semibold text-ink-600">
                  <span>
                    {t('{{n}} مقرر مسجل · {{credits}} ساعة', {
                      n: formatInt(registered.length),
                      credits: formatInt(registeredCredits),
                    })}
                  </span>
                  <span className="text-ink-400">—</span>
                  <span>{t('أدخل درجة متوقعة لكل مقرر ثم شغّل المحاكاة.')}</span>
                </div>

                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <Alert tone="warning">{t('أضف مقرراً من المقررات المسجلة لبدء المحاكاة.')}</Alert>
                  ) : (
                    rows.map((row, index) => (
                      <div
                        key={row.id}
                        className="grid gap-2 rounded-xl border border-ink-100 p-3 sm:grid-cols-[1.6fr_1fr_1fr_auto]"
                      >
                        <div className="flex min-w-0 flex-col justify-end">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                            {row.courseCode} · {t('{{n}} ساعة', { n: formatInt(row.credits) })}
                          </p>
                          <p
                            className="truncate text-sm font-bold text-ink-900"
                            title={i18n.language?.startsWith('ar') ? row.nameAr : row.nameEn}
                          >
                            {i18n.language?.startsWith('ar') ? row.nameAr : row.nameEn}
                          </p>
                        </div>
                        <Input
                          label={index === 0 ? t('النسبة (0–100)') : undefined}
                          type="number"
                          min={0}
                          max={100}
                          placeholder="85"
                          value={row.percentage}
                          onChange={(event) => update(row.id, { percentage: event.target.value })}
                        />
                        <Select
                          label={index === 0 ? t('أو التقدير') : undefined}
                          placeholder={t('بلا تقدير')}
                          value={row.gradeLetter}
                          onChange={(event) => update(row.id, { gradeLetter: event.target.value })}
                          options={GRADES.map((grade) => ({ value: grade, label: grade }))}
                        />
                        <div className="flex items-end">
                          <IconButton
                            label={t('حذف المقرر')}
                            disabled={rows.length === 1}
                            onClick={() =>
                              setRows((current) => current.filter((item) => item.id !== row.id))
                            }
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </IconButton>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}

            {rows.length > 0 && !canRun && (
              <p className="text-xs text-ink-500">
                {t('أدخل درجة متوقعة لمقرر واحد على الأقل.')}
              </p>
            )}

            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!canRun}
              icon={<Calculator className="h-4 w-4" />}
            >
              {t('تشغيل المحاكاة')}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {projected ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('النتيجة المتوقعة')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <StatCard label="SGPA" value={formatNumber(projected.sgpa, 2)} tone="brand" icon={<Calculator className="h-5 w-5" />} />
                  <StatCard label="CGPA" value={formatNumber(projected.cgpa, 2)} tone="gold" icon={<Calculator className="h-5 w-5" />} />
                  <StatCard label={t('الساعات')} value={formatInt(projected.total_credits)} tone="info" />
                  <StatCard label={t('نقاط الجودة')} value={formatNumber(projected.quality_points, 1)} tone="neutral" />
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-sm font-bold text-ink-900">
                    {t('التصنيف: {{value}}', { value: classificationLabel })}
                  </p>
                  {result?.target_reachable !== null && result?.target_reachable !== undefined && (
                    <Badge tone={result.target_reachable ? 'success' : 'warning'} className="mt-2">
                      {result.target_reachable ? t('الهدف قابل للتحقيق') : t('الهدف غير قابل للتحقيق')}
                    </Badge>
                  )}
                  <p className="mt-2 text-xs text-ink-500">
                    {t('المعدل التراكمي الحالي: {{value}}', {
                      value: formatNumber(result?.current.cgpa ?? 0, 2),
                    })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(projected.repeat_cap_applied ?? []).map((code) => (
                      <Badge key={code} tone="info" className="font-mono">
                        {t('إعادة: {{code}}', { code })}
                      </Badge>
                    ))}
                    {(projected.repeat_cap_applied ?? []).length === 0 && (
                      <span className="text-xs text-ink-500">{t('لا توجد ملاحظات.')}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              title={t('لم تُشغّل المحاكاة بعد')}
              description={t('أدخل درجة متوقعة لمقرراتك المسجلة ثم شغّل المحاكاة.')}
              icon={<Calculator className="h-6 w-6" />}
            />
          )}
        </div>
      </div>

      {projected && projected.courses.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t('تفصيل المقررات المحاكاة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>{t('الكود')}</Th>
                    <Th>{t('الساعات')}</Th>
                    <Th>{t('النسبة')}</Th>
                    <Th>{t('التقدير')}</Th>
                    <Th>{t('النقاط')}</Th>
                    <Th>{t('تُحتسب')}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {projected.courses.length === 0 ? (
                    <TableEmpty colSpan={6} message={t('لا توجد مقررات.')} />
                  ) : (
                    projected.courses.map((course, index) => (
                      <Tr key={`${course.code}-${index}`}>
                        <Td className="font-mono text-xs font-bold">{course.code}</Td>
                        <Td>{formatInt(course.credits)}</Td>
                        <Td>{course.percentage === null || course.percentage === undefined ? '—' : formatNumber(course.percentage, 1)}</Td>
                        <Td>{course.letter || '—'}</Td>
                        <Td>{formatNumber(course.points, 2)}</Td>
                        <Td>{course.counts_in_gpa ? t('نعم') : t('لا')}</Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
