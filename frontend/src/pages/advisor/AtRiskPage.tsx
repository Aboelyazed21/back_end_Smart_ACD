import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { AtRiskRow } from '../../lib/types';
import { PROGRAM_LABELS } from '../../lib/constants';
import { formatInt, formatNumber } from '../../lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/Page';
import { Table, TableEmpty, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

const RISK_TONE = { critical: 'danger', high: 'warning', medium: 'info' } as const;
const RISK_LABEL = { critical: 'حرج', high: 'مرتفع', medium: 'متوسط' } as const;

export function AtRiskPage() {
  const query = useQuery({
    queryKey: ['advisor', 'at-risk'],
    queryFn: () => api<{ data: AtRiskRow[] }>('/advisor/at-risk'),
  });

  return (
    <div>
      <PageHeader
        eyebrow="الإنذار المبكر"
        title="الطلاب المعرضون للخطر"
        description="طلاب معدلهم أقل من 2.00 أو لديهم إنذارات أو خطر فصل. تُرتّب الحالات حسب الخطورة."
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data?.data.length === 0 ? (
        <EmptyState title="لا توجد حالات خطر" description="كل طلابك ضمن الحدود الآمنة حاليًا." icon={<ShieldAlert className="h-6 w-6" />} />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>الطالب</Th>
                    <Th>البرنامج</Th>
                    <Th>CGPA</Th>
                    <Th>الإنذارات</Th>
                    <Th>الحالة</Th>
                    <Th>الخطورة</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {(query.data?.data.length ?? 0) === 0 ? (
                    <TableEmpty colSpan={7} message="لا توجد بيانات." />
                  ) : (
                    query.data?.data.map((row) => (
                      <Tr key={row.id}>
                        <Td>
                          <p className="text-sm font-bold text-ink-900">{row.full_name}</p>
                          <p className="font-mono text-xs text-ink-500">{row.student_code}</p>
                        </Td>
                        <Td>
                          <Badge tone="brand">{PROGRAM_LABELS[row.program].short}</Badge>
                        </Td>
                        <Td className="font-bold text-danger">{formatNumber(row.current_cgpa, 2)}</Td>
                        <Td className="text-xs">
                          {formatInt(row.warning_no ?? 0)} / متتالية {formatInt(row.consecutive_warnings ?? 0)} / إجمالية{' '}
                          {formatInt(row.total_warnings ?? 0)}
                        </Td>
                        <Td className="space-x-1 space-x-reverse">
                          {row.probation && <Badge tone="warning">ملاحظة</Badge>}
                          {row.dismissal_risk && <Badge tone="danger">خطر فصل</Badge>}
                          {row.final_chance && <Badge tone="info">فرصة أخيرة</Badge>}
                        </Td>
                        <Td>
                          <Badge tone={RISK_TONE[row.risk_level]}>{RISK_LABEL[row.risk_level]}</Badge>
                        </Td>
                        <Td>
                          <Link to={`/advisor/students/${row.id}`}>
                            <Button variant="outline" size="sm">
                              متابعة
                            </Button>
                          </Link>
                        </Td>
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
