import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { Course, Paginated, Program } from '../../lib/types';
import { PROGRAM_LABELS } from '../../lib/constants';
import { formatInt } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Checkbox, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export function AdminCoursesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [program, setProgram] = useState('');
  const [level, setLevel] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [credits, setCredits] = useState('3');
  const [category, setCategory] = useState('core');
  const [levelHint, setLevelHint] = useState('1');
  const [termHint, setTermHint] = useState('1');
  const [countsInGpa, setCountsInGpa] = useState(true);
  const [prerequisiteCodes, setPrerequisiteCodes] = useState('');
  const [minHours, setMinHours] = useState('');

  const [editing, setEditing] = useState<Course | null>(null);
  const [editNameAr, setEditNameAr] = useState('');
  const [editNameEn, setEditNameEn] = useState('');
  const [editCredits, setEditCredits] = useState('3');
  const [editCategory, setEditCategory] = useState('core');
  const [editLevel, setEditLevel] = useState('1');
  const [editTerm, setEditTerm] = useState('1');
  const [editGpa, setEditGpa] = useState(true);
  const [editActive, setEditActive] = useState(true);

  const query = useQuery({
    queryKey: ['admin', 'courses', submittedSearch, program, level, active, page],
    queryFn: () =>
      api<Paginated<Course>>(
        `/admin/courses${qs({
          search: submittedSearch || undefined,
          program: program || undefined,
          level: level || undefined,
          active: active || undefined,
          page,
          limit: 20,
        })}`,
      ),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api('/admin/courses', {
        method: 'POST',
        body: {
          code: code.trim().toUpperCase(),
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim(),
          credits: Number(credits),
          category: category.trim(),
          levelHint: Number(levelHint),
          termHint: Number(termHint),
          countsInGpa,
          ...(prerequisiteCodes.trim() || minHours
            ? {
                prerequisites: {
                  ...(prerequisiteCodes.trim()
                    ? {
                        allOf: prerequisiteCodes
                          .split(',')
                          .map((item) => item.trim().toUpperCase())
                          .filter(Boolean),
                      }
                    : {}),
                  ...(minHours ? { minPassedCreditHours: Number(minHours) } : {}),
                },
              }
            : {}),
        },
      }),
    onSuccess: async () => {
      toast.success('تمت إضافة المقرر');
      setCreateOpen(false);
      setCode('');
      setNameAr('');
      setNameEn('');
      setPrerequisiteCodes('');
      setMinHours('');
      await invalidate();
    },
    onError: (error) => toast.error('تعذر إضافة المقرر', errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/admin/courses/${editing?.id}`, {
        method: 'PATCH',
        body: {
          nameAr: editNameAr.trim(),
          nameEn: editNameEn.trim(),
          credits: Number(editCredits),
          category: editCategory.trim(),
          levelHint: Number(editLevel),
          termHint: Number(editTerm),
          countsInGpa: editGpa,
          active: editActive,
        },
      }),
    onSuccess: async () => {
      toast.success('تم تحديث المقرر');
      setEditing(null);
      await invalidate();
    },
    onError: (error) => toast.error('تعذر تحديث المقرر', errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/courses/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('تم تعطيل المقرر');
      await invalidate();
    },
    onError: (error) => toast.error('تعذر تعطيل المقرر', errorMessage(error)),
  });

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="المقررات"
        title="كتالوج المقررات"
        description="إدارة المقررات والمتطلبات السابقة والعروض الفصلية. تعطيل المقرر لا يحذف سجلات الطلاب."
        actions={
          <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>
            مقرر جديد
          </Button>
        }
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
              label="بحث"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="الكود أو الاسم"
              leading={<Search className="h-4 w-4" />}
            />
            <Select
              label="البرنامج"
              value={program}
              onChange={(event) => {
                setProgram(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'كل البرامج' },
                ...(Object.keys(PROGRAM_LABELS) as Program[]).map((code) => ({
                  value: code,
                  label: PROGRAM_LABELS[code].ar,
                })),
              ]}
            />
            <Select
              label="المستوى"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'كل المستويات' },
                ...[1, 2, 3, 4].map((value) => ({ value: String(value), label: `المستوى ${value}` })),
              ]}
            />
            <Select
              label="التفعيل"
              value={active}
              onChange={(event) => {
                setActive(event.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'الكل' },
                { value: 'true', label: 'نشط' },
                { value: 'false', label: 'غير نشط' },
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
        <EmptyState title="لا توجد مقررات" description="جرّب تعديل البحث." icon={<BookOpen className="h-6 w-6" />} />
      ) : (
        <Card>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <Tr>
                    <Th>الكود</Th>
                    <Th>الاسم</Th>
                    <Th>الساعات</Th>
                    <Th>الفئة</Th>
                    <Th>المستوى</Th>
                    <Th>التفعيل</Th>
                    <Th>تعارضات</Th>
                    <Th>إجراءات</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((course) => (
                    <Tr key={course.id}>
                      <Td className="font-mono text-xs font-bold text-brand-700">{course.code}</Td>
                      <Td>
                        <p className="text-sm font-semibold text-ink-900">{course.name_ar}</p>
                        <p className="text-xs text-ink-500">{course.name_en}</p>
                      </Td>
                      <Td>{formatInt(course.credits)}</Td>
                      <Td className="text-xs">{course.category}</Td>
                      <Td>{formatInt(course.level_hint)}</Td>
                      <Td>
                        <Badge tone={course.active ? 'success' : 'neutral'}>{course.active ? 'نشط' : 'معطّل'}</Badge>
                      </Td>
                      <Td>
                        {course.anomaly_ids.length === 0 ? (
                          <span className="text-xs text-ink-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {course.anomaly_ids.map((id) => (
                              <Badge key={id} tone="warning" className="font-mono text-[10px]">
                                {id}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-0.5">
                          <Link to={`/admin/courses/${course.id}`}>
                            <Button size="sm" variant="ghost">
                              تفاصيل
                            </Button>
                          </Link>
                          <IconButton
                            label="تعديل"
                            onClick={() => {
                              setEditing(course);
                              setEditNameAr(course.name_ar);
                              setEditNameEn(course.name_en);
                              setEditCredits(String(course.credits));
                              setEditCategory(course.category);
                              setEditLevel(String(course.level_hint));
                              setEditTerm(String(course.term_hint));
                              setEditGpa(course.counts_in_gpa);
                              setEditActive(course.active);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="تعطيل" onClick={() => remove.mutate(course.id)}>
                            <Trash2 className="h-4 w-4 text-danger" />
                          </IconButton>
                        </div>
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

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="إضافة مقرر"
        description="الكود بصيغة ثلاثة أحرف ورقم من أربعة خانات، مثل CSC3101."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!code.trim() || !nameAr.trim() || !nameEn.trim()}
            >
              إضافة المقرر
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="كود المقرر"
              dir="ltr"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="CSC3101"
              maxLength={7}
              required
            />
            <Input
              label="الفئة"
              dir="ltr"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="core / elective"
              required
            />
            <Input label="الاسم العربي" value={nameAr} onChange={(event) => setNameAr(event.target.value)} required />
            <Input
              label="الاسم الإنجليزي"
              dir="ltr"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              required
            />
            <Input
              label="الساعات"
              type="number"
              min={0}
              max={12}
              value={credits}
              onChange={(event) => setCredits(event.target.value)}
            />
            <Select
              label="المستوى"
              value={levelHint}
              onChange={(event) => setLevelHint(event.target.value)}
              options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: `المستوى ${value}` }))}
            />
            <Select
              label="الفصل المقترح"
              value={termHint}
              onChange={(event) => setTermHint(event.target.value)}
              options={[
                { value: '1', label: 'الفصل الأول (خريف)' },
                { value: '2', label: 'الفصل الثاني (ربيع)' },
              ]}
            />
            <div className="flex items-end pb-2">
              <Checkbox
                label="تُحتسب في المعدل"
                checked={countsInGpa}
                onChange={(event) => setCountsInGpa(event.target.checked)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-ink-100 p-4">
            <p className="mb-3 text-sm font-bold text-ink-900">المتطلبات السابقة (اختياري)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="أكواد المتطلبات"
                dir="ltr"
                value={prerequisiteCodes}
                onChange={(event) => setPrerequisiteCodes(event.target.value)}
                placeholder="MTH1101, CSC2101"
                hint="افصل بين الأكواد بفاصلة."
              />
              <Input
                label="الحد الأدنى للساعات المجتازة"
                type="number"
                min={0}
                max={300}
                value={minHours}
                onChange={(event) => setMinHours(event.target.value)}
                placeholder="45"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="تعديل المقرر"
        description={editing?.code}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button onClick={() => update.mutate()} loading={update.isPending}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="الاسم العربي" value={editNameAr} onChange={(event) => setEditNameAr(event.target.value)} />
            <Input
              label="الاسم الإنجليزي"
              dir="ltr"
              value={editNameEn}
              onChange={(event) => setEditNameEn(event.target.value)}
            />
            <Input
              label="الساعات"
              type="number"
              min={0}
              max={12}
              value={editCredits}
              onChange={(event) => setEditCredits(event.target.value)}
            />
            <Input label="الفئة" dir="ltr" value={editCategory} onChange={(event) => setEditCategory(event.target.value)} />
            <Select
              label="المستوى"
              value={editLevel}
              onChange={(event) => setEditLevel(event.target.value)}
              options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: `المستوى ${value}` }))}
            />
            <Select
              label="الفصل المقترح"
              value={editTerm}
              onChange={(event) => setEditTerm(event.target.value)}
              options={[
                { value: '1', label: 'خريف' },
                { value: '2', label: 'ربيع' },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox label="تُحتسب في المعدل" checked={editGpa} onChange={(event) => setEditGpa(event.target.checked)} />
            <Checkbox
              label="نشط"
              checked={editActive}
              onChange={(event) => setEditActive(event.target.checked)}
            />
          </div>
          <Link to={`/admin/courses/${editing?.id}`} className="text-xs font-bold text-brand-700 hover:underline">
            فتح صفحة المتطلبات والعروض
          </Link>
        </div>
      </Modal>
    </div>
  );
}
