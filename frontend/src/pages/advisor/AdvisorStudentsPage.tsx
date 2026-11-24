import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Users } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { AdvisorStudentRow, Paginated } from '../../lib/types';
import { PROGRAM_LABELS } from '../../lib/constants';
import { formatInt, formatNumber } from '../../lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

export function AdvisorStudentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['advisor', 'students', submitted, page],
    queryFn: () =>
      api<Paginated<AdvisorStudentRow>>(`/advisor/students${qs({ search: submitted, page, limit: 20 })}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow={t('طلابي')}
        title={t('قائمة الطلاب المسندين')}
        description={t(
          'ابحث بالاسم أو رقم الطالب. تُرتّب القائمة حسب المعدل التراكمي تصاعديًا لإبراز الحالات التي تحتاج متابعة.',
        )}
      />

      <Card className="mb-4">
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSubmitted(search.trim());
            }}
          >
            <Input
              label={t('بحث')}
              placeholder={t('الاسم أو رقم الطالب')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              leading={<Search className="h-4 w-4" />}
              className="w-full sm:w-80"
            />
            <Button type="submit" variant="outline">
              {t('بحث')}
            </Button>
            {submitted && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setSubmitted('');
                  setPage(1);
                }}
              >
                {t('مسح')}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data?.data.length === 0 ? (
        <EmptyState
          title={t('لا يوجد طلاب مطابقون')}
          description={t('جرّب بحثًا آخر.')}
          icon={<Users className="h-6 w-6" />}
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
                    <Th>{t('الفصول النظامية')}</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {(query.data?.data.length ?? 0) === 0 ? (
                    <TableEmpty colSpan={7} message={t('لا توجد بيانات.')} />
                  ) : (
                    query.data?.data.map((student) => (
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
                        <Td>{student.level}</Td>
                        <Td>
                          <span
                            className={
                              Number(student.current_cgpa) < 2
                                ? 'font-bold text-danger'
                                : 'font-bold text-emerald-700'
                            }
                          >
                            {formatNumber(student.current_cgpa, 2)}
                          </span>
                        </Td>
                        <Td>{formatInt(student.passed_credits)}</Td>
                        <Td>{formatInt(student.regular_semesters_completed)}</Td>
                        <Td>
                          <Link to={`/advisor/students/${student.id}`}>
                            <Button variant="outline" size="sm">
                              {t('فتح الملف')}
                            </Button>
                          </Link>
                        </Td>
                      </Tr>
                    ))
                  )}
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
