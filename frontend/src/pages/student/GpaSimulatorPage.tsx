import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { GpaResult } from '../../lib/types';
import { formatInt, formatNumber, currentTermValue } from '../../lib/format';
import { Alert, EmptyState } from '../../components/ui/Feedback';
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
  percentage: string;
  gradeLetter: string;
}

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];

let rowSeed = 1;
const newRow = (): SimRow => ({ id: rowSeed++, courseCode: '', percentage: '', gradeLetter: '' });

export function GpaSimulatorPage() {
  const [term, setTerm] = useState(currentTermValue());
  const [rows, setRows] = useState<SimRow[]>([newRow()]);
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<GpaResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const simulated = rows
        .filter((row) => row.courseCode.trim())
        .map((row) => ({
          courseCode: row.courseCode.trim().toUpperCase(),
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

  const update = (id: number, patch: Partial<SimRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div>
      <PageHeader
        eyebrow="محاكاة المعدل"
        title="ماذا لو حصلت على هذه الدرجات؟"
        description="محاكاة استشارية لحساب المعدل الفصلي والتراكمي وفق أوزان الساعات وقواعد الإعادة. لا تُحدّث أي درجة رسمية."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRows((current) => [...current, newRow()])}
                  icon={<Plus className="h-4 w-4" />}
                  disabled={rows.length >= 30}
                >
                  إضافة مقرر
                </Button>
              }
            >
              المقررات والدرجات المتوقعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TermSelect value={term} onChange={setTerm} label="الفصل" />
              <Input
                label="المعدل التراكمي المستهدف (اختياري)"
                type="number"
                min={0}
                max={4}
                step="0.01"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                hint="0 – 4.00"
              />
            </div>

            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={row.id} className="grid gap-2 rounded-xl border border-ink-100 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Input
                    label={index === 0 ? 'كود المقرر' : undefined}
                    dir="ltr"
                    placeholder="CSC3101"
                    value={row.courseCode}
                    onChange={(event) => update(row.id, { courseCode: event.target.value.toUpperCase() })}
                  />
                  <Input
                    label={index === 0 ? 'النسبة (0–100)' : undefined}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="85"
                    value={row.percentage}
                    onChange={(event) => update(row.id, { percentage: event.target.value })}
                  />
                  <Select
                    label={index === 0 ? 'أو التقدير' : undefined}
                    placeholder="بلا تقدير"
                    value={row.gradeLetter}
                    onChange={(event) => update(row.id, { gradeLetter: event.target.value })}
                    options={GRADES.map((grade) => ({ value: grade, label: grade }))}
                  />
                  <div className="flex items-end">
                    <IconButton
                      label="حذف المقرر"
                      disabled={rows.length === 1}
                      onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>

            {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}

            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              icon={<Calculator className="h-4 w-4" />}
            >
              تشغيل المحاكاة
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {result ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>النتيجة المتوقعة</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <StatCard label="SGPA" value={formatNumber(result.sgpa, 2)} tone="brand" icon={<Calculator className="h-5 w-5" />} />
                  <StatCard label="CGPA" value={formatNumber(result.cgpa, 2)} tone="gold" icon={<Calculator className="h-5 w-5" />} />
                  <StatCard label="الساعات" value={formatInt(result.total_credits)} tone="info" />
                  <StatCard label="نقاط الجودة" value={formatNumber(result.quality_points, 1)} tone="neutral" />
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-sm font-bold text-ink-900">التصنيف: {result.classification}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {result.flags.map((flag) => (
                      <Badge key={flag} tone="warning">
                        {flag}
                      </Badge>
                    ))}
                    {result.repeat_cap_applied.map((code) => (
                      <Badge key={code} tone="info" className="font-mono">
                        إعادة: {code}
                      </Badge>
                    ))}
                    {result.flags.length === 0 && result.repeat_cap_applied.length === 0 && (
                      <span className="text-xs text-ink-500">لا توجد ملاحظات.</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              title="لم تُشغّل المحاكاة بعد"
              description="أدخل كود المقرر ودرجة متوقعة ثم شغّل المحاكاة."
              icon={<Calculator className="h-6 w-6" />}
            />
          )}
        </div>
      </div>

      {result && result.courses.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>تفصيل المقررات المحاكاة</CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>الكود</Th>
                    <Th>الساعات</Th>
                    <Th>النسبة</Th>
                    <Th>التقدير</Th>
                    <Th>النقاط</Th>
                    <Th>تُحتسب</Th>
                  </Tr>
                </THead>
                <TBody>
                  {result.courses.length === 0 ? (
                    <TableEmpty colSpan={6} message="لا توجد مقررات." />
                  ) : (
                    result.courses.map((course, index) => (
                      <Tr key={`${String(course.code ?? index)}-${index}`}>
                        <Td className="font-mono text-xs font-bold">{String(course.code ?? '—')}</Td>
                        <Td>{formatInt(course.credits as number)}</Td>
                        <Td>{course.percentage === null || course.percentage === undefined ? '—' : formatNumber(course.percentage as number, 1)}</Td>
                        <Td>{String(course.grade_letter ?? '—')}</Td>
                        <Td>{formatNumber(course.grade_points as number, 2)}</Td>
                        <Td>{course.counts_in_gpa ? 'نعم' : 'لا'}</Td>
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
