import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Search } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { AdminStudentRow, Paginated, Program } from '../../lib/types';
import { PROGRAM_LABELS } from '../../lib/constants';
import { formatInt, formatNumber } from '../../lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Checkbox, Input, Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

export function AdminStudentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [program, setProgram] = useState('');
  const [level, setLevel] = useState('');
  const [atRisk, setAtRisk] = useState(false);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'students', submittedSearch, program, level, atRisk, page],
    queryFn: () =>
      api<Paginated<AdminStudentRow>>(
        `/admin/students${qs({
          search: submittedSearch || undefined,
          program: program || undefined,
          level: level || undefined,
          atRisk: atRisk ? 'true' : undefined,
          page,
          limit: 20,
        })}`,
      ),
  });

  return (
    <div>
      <PageHeader
        eyebrow={t('إدارة الطلاب')}
        title={t('سجلات الطلاب')}
        description={t(
          'ابحث عن طالب وافتح ملفه لتعديل بياناته الأكاديمية أو مراجعة خططه وحالاته. تعديل البيانات يؤثر على القرارات المستقبلية.',
        )}
      />

      <Card className="mb-4">
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSubmittedSearch(search.trim());
            }}
          >
            <Input
              label={t('بحث')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('الاسم أو رقم الطالب')}
              leading={<Search className="h-4 w-4" />}
            />
            <Select
              label={t('البرنامج')}
              value={program}
              onChange={(event) => {
                setProgram(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: t('كل البرامج') },
                ...(Object.keys(PROGRAM_LABELS) as Program[]).map((code) => ({
                  value: code,
                  label: t(PROGRAM_LABELS[code].ar),
                })),
              ]}
            />
            <Select
              label={t('المستوى')}
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: t('كل المستويات') },
                ...[1, 2, 3, 4].map((value) => ({
                  value: String(value),
                  label: t('المستوى {{level}}', { level: value }),
                })),
              ]}
            />
            <div className="flex items-end pb-2">
              <Checkbox
                label={t('المعرضون للخطر فقط')}
                checked={atRisk}
                onChange={(event) => {
                  setAtRisk(event.target.checked);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full">
                {t('تطبيق')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (query.data?.data.length ?? 0) === 0 ? (
        <EmptyState
          title={t('لا يوجد طلاب مطابقون')}
          description={t('جرّب تغيير البحث أو عوامل التصفية.')}
          icon={<GraduationCap className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>{t('الطالب')}</Th>
                    <Th>{t('البرنامج')}</Th>
                    <Th>{t('المستوى')}</Th>
                    <Th>CGPA</Th>
                    <Th>{t('الساعات')}</Th>
                    <Th>{t('الفصول')}</Th>
                    <Th>{t('تاريخ الإنشاء')}</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {query.data?.data.map((student) => (
                    <Tr key={student.id}>
                      <Td>
                        <p className="text-sm font-bold text-ink-900">{student.full_name}</p>
                        <p className="text-xs text-ink-500" dir="ltr">
                          {student.student_code} · {student.email}
                        </p>
                      </Td>
                      <Td>
                        <Badge tone="brand">{PROGRAM_LABELS[student.program].short}</Badge>
                      </Td>
                      <Td>{formatInt(student.level)}</Td>
                      <Td>
                        <span
                          className={
                            Number(student.current_cgpa) < 2 ? 'font-bold text-danger' : 'font-bold text-emerald-700'
                          }
                        >
                          {formatNumber(student.current_cgpa, 2)}
                        </span>
                      </Td>
                      <Td>{formatInt(student.passed_credits)}</Td>
                      <Td>{formatInt(student.regular_semesters_completed)}</Td>
                      <Td className="text-xs text-ink-500">
                        {student.status === 'active' ? t('نشط') : student.status}
                      </Td>
                      <Td>
                        <Link to={`/admin/students/${student.id}`}>
                          <Button size="sm" variant="outline">
                            {t('فتح الملف')}
                          </Button>
                        </Link>
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
