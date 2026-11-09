import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Search, TriangleAlert } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { DataAnomaly, Paginated } from '../../lib/types';
import { SEVERITY_LABELS } from '../../lib/constants';
import { formatInt } from '../../lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { PageHeader, StatCard } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

const TYPES = [
  'rule_conflict',
  'feasibility',
  'typo',
  'rule_overlap',
  'missing_data',
  'inconsistency',
  'ambiguity',
  'wrong_code',
  'wrong_prereq',
  'prereq_conflict',
  'invalid_code',
  'code_and_prereq_conflict',
  'code_collision',
  'wrong_reference',
  'pool_conflict',
];

export function AdminAnomaliesPage() {
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [course, setCourse] = useState('');
  const [submittedCourse, setSubmittedCourse] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'anomalies', status, severity, type, submittedCourse, page],
    queryFn: () =>
      api<Paginated<DataAnomaly>>(
        `/admin/anomalies${qs({
          status: status || undefined,
          severity: severity || undefined,
          type: type || undefined,
          course: submittedCourse || undefined,
          page,
          limit: 20,
        })}`,
      ),
  });

  const rows = query.data?.data ?? [];
  const blocking = rows.filter((row) => row.severity === 'blocking' && row.status === 'open').length;
  const warnings = rows.filter((row) => row.severity === 'warning' && row.status === 'open').length;

  return (
    <div>
      <PageHeader
        eyebrow="تعارضات البيانات"
        title="مراجعة تعارضات اللائحة"
        description="كل تعارض مانع (blocking) يحوّل القرار المرتبط إلى REVIEW_REQUIRED ويُنشئ حالة محوّلة. حلّ التعارض يعيد تقييم القرارات المتأثرة تلقائيًا."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="مانعة مفتوحة"
          value={formatInt(blocking)}
          hint="توقف القرارات فورًا"
          icon={<TriangleAlert className="h-5 w-5" />}
          tone={blocking > 0 ? 'danger' : 'success'}
        />
        <StatCard label="تحذيرات مفتوحة" value={formatInt(warnings)} hint="تُقيّم بقيمة عمل مع تسجيل العلم" tone="gold" />
        <StatCard label="إجمالي النتائج" value={formatInt(query.data?.pagination.total ?? 0)} hint="حسب عوامل التصفية" tone="neutral" />
      </div>

      <Card className="mb-4">
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSubmittedCourse(course.trim().toUpperCase());
            }}
          >
            <Select
              label="الحالة"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'الكل' },
                { value: 'open', label: 'مفتوح' },
                { value: 'resolved', label: 'محلول' },
              ]}
            />
            <Select
              label="الخطورة"
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'الكل' },
                { value: 'blocking', label: 'مانع' },
                { value: 'warning', label: 'تحذير' },
                { value: 'info', label: 'معلوماتي' },
              ]}
            />
            <Select
              label="النوع"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              options={[{ value: '', label: 'كل الأنواع' }, ...TYPES.map((value) => ({ value, label: value }))]}
            />
            <Input
              label="كود المقرر"
              dir="ltr"
              value={course}
              onChange={(event) => setCourse(event.target.value.toUpperCase())}
              placeholder="CSC3101"
              leading={<Search className="h-4 w-4" />}
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
          title="لا توجد تعارضات"
          description="لا توجد بيانات مطابقة لعوامل التصفية."
          icon={<TriangleAlert className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>المعرّف</Th>
                    <Th>العنوان</Th>
                    <Th>الخطورة</Th>
                    <Th>النوع</Th>
                    <Th>المقررات</Th>
                    <Th>الحالة</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((row) => {
                    const severityMeta = SEVERITY_LABELS[row.severity];
                    return (
                      <Tr key={row.id}>
                        <Td className="font-mono text-xs font-bold text-brand-700">{row.id}</Td>
                        <Td>
                          <p className="max-w-sm text-sm font-semibold text-ink-900">{row.title_ar}</p>
                          {row.title_en && (
                            <p className="max-w-sm truncate text-xs text-ink-500" dir="ltr">
                              {row.title_en}
                            </p>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={(severityMeta?.tone as never) ?? 'neutral'}>
                            {severityMeta?.ar ?? row.severity}
                          </Badge>
                        </Td>
                        <Td className="font-mono text-[11px] text-ink-600">{row.type}</Td>
                        <Td>
                          <div className="flex max-w-[12rem] flex-wrap gap-1">
                            {row.affected_courses.slice(0, 4).map((code) => (
                              <Badge key={code} tone="neutral" className="font-mono text-[10px]">
                                {code}
                              </Badge>
                            ))}
                            {row.affected_courses.length > 4 && (
                              <Badge tone="neutral" className="text-[10px]">
                                +{row.affected_courses.length - 4}
                              </Badge>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={row.status === 'open' ? 'warning' : 'success'}>
                            {row.status === 'open' ? 'مفتوح' : 'محلول'}
                          </Badge>
                        </Td>
                        <Td>
                          <Link to={`/admin/anomalies/${row.id}`}>
                            <Button size="sm" variant="outline" icon={<ExternalLink className="h-4 w-4" />}>
                              مراجعة
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
