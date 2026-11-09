import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Scale, Search } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { Paginated, RegulationRule } from '../../lib/types';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

export function AdminRulesPage() {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'rules', submittedSearch, status, page],
    queryFn: () =>
      api<Paginated<RegulationRule>>(
        `/admin/regulation/rules${qs({
          search: submittedSearch || undefined,
          status: status || undefined,
          page,
          limit: 20,
        })}`,
      ),
  });

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="قواعد اللائحة"
        title="فهرس قواعد القرار"
        description="كل قرار في النظام يحمل rule_code ورقم مادة وصفحة. هذه القواعد مقتبسة حرفيًا من لائحة AIDM ولا يمكن تعديل نصها من الواجهة."
      />

      <Card className="mb-4">
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSubmittedSearch(search.trim());
            }}
          >
            <Input
              label="بحث"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="الكود أو العنوان"
              leading={<Search className="h-4 w-4" />}
            />
            <Select
              label="الحالة"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'الكل' },
                { value: 'active', label: 'سارية' },
                { value: 'superseded', label: 'ملغاة' },
              ]}
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
        <EmptyState title="لا توجد قواعد" description="لا توجد قواعد مطابقة." icon={<Scale className="h-6 w-6" />} />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>الكود</Th>
                    <Th>العنوان</Th>
                    <Th>المادة</Th>
                    <Th>الصفحة</Th>
                    <Th>الحالة</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((rule) => (
                    <Tr key={rule.rule_code}>
                      <Td className="font-mono text-xs font-bold text-brand-700">{rule.rule_code}</Td>
                      <Td>
                        <p className="text-sm font-semibold text-ink-900">{rule.title_ar}</p>
                        {rule.title_en && (
                          <p className="text-xs text-ink-500" dir="ltr">
                            {rule.title_en}
                          </p>
                        )}
                      </Td>
                      <Td className="text-xs">
                        {rule.article_no}
                        {rule.clause_no ? ` / ${rule.clause_no}` : ''}
                      </Td>
                      <Td className="text-xs">ص {rule.page_no}</Td>
                      <Td>
                        <Badge tone={rule.status === 'active' ? 'success' : 'neutral'}>
                          {rule.status === 'active' ? 'سارية' : 'ملغاة'}
                        </Badge>
                      </Td>
                      <Td>
                        <Link to={`/admin/rules/${encodeURIComponent(rule.rule_code)}`}>
                          <Button size="sm" variant="outline" icon={<ExternalLink className="h-4 w-4" />}>
                            عرض
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
