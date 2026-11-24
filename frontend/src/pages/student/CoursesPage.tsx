import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen, Layers, ListTree } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { Enrollment, ProgramInfo, RecommendedPlan } from '../../lib/types';
import { GRADE_STATUS_LABELS, PROGRAM_LABELS } from '../../lib/constants';
import { currentTermValue, formatInt, formatNumber, formatTerm } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/Page';
import { Select } from '../../components/ui/Input';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { TermSelect } from '../../components/ui/PaginationBar';
import { cn } from '../../lib/format';

type Tab = 'enrollments' | 'recommended' | 'program';

export function CoursesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('enrollments');
  const [term, setTerm] = useState(currentTermValue());
  const [level, setLevel] = useState('1');

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'enrollments', label: 'سجلي الأكاديمي', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'recommended', label: 'الخطة الموصى بها', icon: <ListTree className="h-4 w-4" /> },
    { id: 'program', label: 'متطلبات البرنامج', icon: <Layers className="h-4 w-4" /> },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={t('السجل الأكاديمي')}
        title={t('المقررات والتقدم')}
        description={t(
          'سجل كل المحاولات والدرجات، الخطة الاستشارية الموصى بها لمستواك، ومجموعات الاختياري في برنامجك.',
        )}
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-ink-100 bg-surface p-1 shadow-card">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition',
              tab === item.id ? 'bg-primary text-on-primary shadow-sm' : 'text-ink-600 hover:bg-ink-50',
            )}
          >
            {item.icon}
            {t(item.label)}
          </button>
        ))}
      </div>

      {tab === 'enrollments' && <EnrollmentsTab />}
      {tab === 'recommended' && (
        <RecommendedTab term={term} setTerm={setTerm} level={level} setLevel={setLevel} />
      )}
      {tab === 'program' && <ProgramTab />}
    </div>
  );
}

function EnrollmentsTab() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['student', 'enrollments'],
    queryFn: () => api<{ data: Enrollment[] }>('/student/enrollments'),
  });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const rows = query.data.data;
  const passed = rows.filter((row) => row.status === 'passed');
  const failed = rows.filter((row) => row.status === 'failed' || row.status === 'absent');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('إجمالي المحاولات')}</p>
          <p className="mt-1 font-display text-xl font-extrabold">{formatInt(rows.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('مقررات ناجحة')}</p>
          <p className="mt-1 font-display text-xl font-extrabold text-emerald-700">{formatInt(passed.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">{t('محاولات راسبة/غياب')}</p>
          <p className="mt-1 font-display text-xl font-extrabold text-danger">{formatInt(failed.length)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('كل المقررات المسجلة')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <Tr>
                  <Th>{t('المقرر')}</Th>
                  <Th>{t('الفصل')}</Th>
                  <Th>{t('الساعات')}</Th>
                  <Th>{t('التقدير')}</Th>
                  <Th>{t('النسبة')}</Th>
                  <Th>{t('نقاط')}</Th>
                  <Th>{t('الحالة')}</Th>
                  <Th>{t('المحاولة')}</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.length === 0 ? (
                  <TableEmpty colSpan={8} message={t('لا توجد مقررات مسجلة في سجلك.')} />
                ) : (
                  rows.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <p className="font-mono text-xs font-bold text-brand-700">{row.courseCode}</p>
                        <p className="text-sm font-semibold text-ink-900">{row.nameAr}</p>
                        <p className="text-xs text-ink-500">{row.nameEn}</p>
                      </Td>
                      <Td className="text-xs">{formatTerm(row.term)}</Td>
                      <Td className="tabular-nums">{formatInt(row.credits)}</Td>
                      <Td className="font-mono font-bold">{row.gradeLetter ?? '—'}</Td>
                      <Td className="tabular-nums">{row.percentage === null ? '—' : formatNumber(row.percentage, 1)}</Td>
                      <Td className="tabular-nums">{row.gradePoints === null ? '—' : formatNumber(row.gradePoints, 2)}</Td>
                      <Td>
                        <Badge
                          tone={
                            row.status === 'passed'
                              ? 'success'
                              : row.status === 'failed' || row.status === 'absent'
                                ? 'danger'
                                : row.status === 'in_progress'
                                  ? 'info'
                                  : 'neutral'
                          }
                        >
                          {t(GRADE_STATUS_LABELS[row.status] ?? row.status)}
                        </Badge>
                      </Td>
                      <Td className="text-xs">
                        {row.attemptNo}
                        {row.isRepeat && <span className="ms-1 text-[10px] text-gold-700">{t('إعادة')}</span>}
                      </Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  );
}

function RecommendedTab({
  term,
  setTerm,
  level,
  setLevel,
}: {
  term: string;
  setTerm: (value: string) => void;
  level: string;
  setLevel: (value: string) => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['student', 'recommended', term, level],
    queryFn: () => api<{ data: RecommendedPlan }>(`/student/recommended-plan${qs({ term, level })}`),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <TermSelect value={term} onChange={setTerm} label={t('الفصل')} />
            <Select
              label={t('المستوى')}
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: t('المستوى {{level}}', { level: value }) }))}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError || !query.data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.data.items.length === 0 ? (
        <EmptyState title={t('لا توجد خطة موصى بها')} description={t('قد لا توجد بيانات لهذا المستوى/الفصل.')} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle
              action={
                <div className="flex gap-1">
                  <Badge tone="brand">{query.data.data.slot}</Badge>
                  <Badge tone="neutral">{t('{{n}} ساعة', { n: formatInt(query.data.data.totalCredits) })}</Badge>
                </div>
              }
            >
              {t('خطة {{program}} — المستوى {{level}}', {
                program: t(PROGRAM_LABELS[query.data.data.program].ar),
                level: query.data.data.level,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>#</Th>
                    <Th>{t('النوع')}</Th>
                    <Th>{t('المقرر / المجموعة')}</Th>
                    <Th>{t('الاسم')}</Th>
                    <Th>{t('الساعات')}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {query.data.data.items.map((item, index) => (
                    <Tr key={`${item.courseCode ?? item.pool}-${index}`}>
                      <Td className="text-xs text-ink-400">{item.position + 1}</Td>
                      <Td>
                        <Badge tone={item.kind === 'elective' ? 'gold' : 'brand'}>
                          {item.kind === 'elective' ? t('اختياري') : t('إجباري')}
                        </Badge>
                      </Td>
                      <Td className="font-mono text-xs font-bold">{item.courseCode ?? item.pool ?? '—'}</Td>
                      <Td>
                        <p className="text-sm font-semibold">{item.nameAr ?? '—'}</p>
                        <p className="text-xs text-ink-500">{item.nameEn ?? ''}</p>
                      </Td>
                      <Td className="tabular-nums">{formatInt(item.credits)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Alert tone="neutral" className="mt-4">
              {t(
                'الخطة الموصى بها إرشادية ولا تعني الأهلية أو التسجيل. استخدم صفحة أهلية التسجيل أو ولّد مسودة خطة.',
              )}
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProgramTab() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['student', 'program'],
    queryFn: () => api<{ data: ProgramInfo }>('/student/courses'),
  });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const info = query.data.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('مجموعات الاختياري — {{program}}', { program: t(PROGRAM_LABELS[info.program].ar) })}</CardTitle>
      </CardHeader>
      <CardContent>
        {info.pools.length === 0 ? (
          <EmptyState title={t('لا توجد مجموعات اختيارية')} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {info.pools.map((pool) => (
              <div key={pool.code} className="rounded-xl border border-ink-100 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-brand-700">{pool.code}</span>
                  <Badge tone="gold">{t('{{n}} ساعة', { n: formatInt(pool.credits_required) })}</Badge>
                </div>
                <p className="mt-1 text-sm font-bold text-ink-900">{pool.name_ar}</p>
                <p className="text-xs text-ink-500">{pool.name_en}</p>
                <p className="mt-2 text-[11px] text-ink-400">{t('المصدر: {{source}}', { source: pool.source })}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
