import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { CourseDetail, Season } from '../../lib/types';
import { COURSE_ROLES, PROGRAM_LABELS, SEASONS } from '../../lib/constants';
import { formatDate, formatInt } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { KeyValue } from '../../components/ui/Page';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

export function AdminCourseDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [prereqOpen, setPrereqOpen] = useState(false);
  const [prereqType, setPrereqType] = useState<'prerequisite' | 'corequisite' | 'hours_required'>(
    'prerequisite',
  );
  const [requiredCode, setRequiredCode] = useState('');
  const [minHours, setMinHours] = useState('');

  const [offeringOpen, setOfferingOpen] = useState(false);
  const [academicYear, setAcademicYear] = useState(currentAcademicYear());
  const [season, setSeason] = useState<Season>('fall');
  const [capacity, setCapacity] = useState('40');
  const [offeringStatus, setOfferingStatus] = useState<'open' | 'closed' | 'cancelled'>('open');
  const [editingOffering, setEditingOffering] = useState<CourseDetail['offerings'][number] | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'course', id],
    queryFn: () => api<{ data: CourseDetail }>(`/admin/courses/${id}`),
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'course', id] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
  };

  const addPrerequisite = useMutation({
    mutationFn: () =>
      api(`/admin/courses/${id}/prerequisites`, {
        method: 'POST',
        body: {
          type: prereqType,
          ...(prereqType === 'hours_required'
            ? { minPassedCreditHours: Number(minHours || 0) }
            : { requiredCourseCode: requiredCode.trim().toUpperCase() }),
        },
      }),
    onSuccess: async () => {
      toast.success(t('تمت إضافة المتطلب'));
      setPrereqOpen(false);
      setRequiredCode('');
      setMinHours('');
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر إضافة المتطلب'), errorMessage(error)),
  });

  const removePrerequisite = useMutation({
    mutationFn: (prerequisiteId: string) =>
      api(`/admin/prerequisites/${prerequisiteId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('تم حذف المتطلب'));
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر حذف المتطلب'), errorMessage(error)),
  });

  const saveOffering = useMutation({
    mutationFn: () =>
      editingOffering
        ? api(`/admin/offerings/${editingOffering.id}`, {
            method: 'PATCH',
            body: { capacity: Number(capacity), status: offeringStatus },
          })
        : api(`/admin/courses/${id}/offerings`, {
            method: 'POST',
            body: {
              academicYear: academicYear.trim(),
              season,
              capacity: Number(capacity),
              status: offeringStatus,
            },
          }),
    onSuccess: async () => {
      toast.success(
        editingOffering ? t('تم تحديث العرض الفصلي') : t('تمت إضافة العرض الفصلي'),
      );
      setOfferingOpen(false);
      setEditingOffering(null);
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر حفظ العرض الفصلي'), errorMessage(error)),
  });

  const removeOffering = useMutation({
    mutationFn: (offeringId: string) => api(`/admin/offerings/${offeringId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('تم حذف العرض الفصلي'));
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر حذف العرض الفصلي'), errorMessage(error)),
  });

  if (query.isLoading) return <LoadingBlock label={t('جارٍ تحميل المقرر…')} />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { course, prerequisites, requirements, offerings } = query.data.data;

  const openNewOffering = () => {
    setEditingOffering(null);
    setAcademicYear(currentAcademicYear());
    setSeason('fall');
    setCapacity('40');
    setOfferingStatus('open');
    setOfferingOpen(true);
  };

  return (
    <div>
      <Link
        to="/admin/courses"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowRight className="h-4 w-4" /> {t('كتالوج المقررات')}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-brand-700">{course.code}</p>
          <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-950 sm:text-3xl">
            {course.name_ar}
          </h1>
          <p className="mt-1 text-sm text-ink-500" dir="ltr">
            {course.name_en}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={course.active ? 'success' : 'neutral'}>
            {course.active ? t('نشط') : t('معطّل')}
          </Badge>
          <Badge tone="brand">{t('{{n}} ساعة', { n: formatInt(course.credits) })}</Badge>
          {course.anomaly_ids.map((anomaly) => (
            <Link key={anomaly} to={`/admin/anomalies/${anomaly}`}>
              <Badge tone="warning" className="font-mono text-[10px]">
                {anomaly}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('بيانات المقرر')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label={t('الساعات')} value={formatInt(course.credits)} />
              <KeyValue label={t('الفئة')} value={course.category} />
              <KeyValue label={t('المستوى')} value={formatInt(course.level_hint)} />
              <KeyValue
                label={t('الفصل المقترح')}
                value={course.term_hint === 1 ? t('خريف') : t('ربيع')}
              />
              <KeyValue
                label={t('تُحتسب في المعدل')}
                value={course.counts_in_gpa ? t('نعم') : t('لا')}
              />
              <KeyValue label={t('تاريخ الإنشاء')} value={formatDate(course.created_at)} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle
              action={
                <Button size="sm" variant="outline" onClick={() => setPrereqOpen(true)} icon={<Plus className="h-4 w-4" />}>
                  {t('إضافة متطلب')}
                </Button>
              }
            >
              {t('المتطلبات السابقة')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prerequisites.length === 0 ? (
              <EmptyState
                title={t('لا توجد متطلبات')}
                description={t('هذا المقرر متاح دون متطلب سابق محدد.')}
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>{t('النوع')}</Th>
                      <Th>{t('المتطلب')}</Th>
                      <Th>{t('الحد الأدنى')}</Th>
                      <Th />
                    </Tr>
                  </THead>
                  <TBody>
                    {prerequisites.map((row) => (
                      <Tr key={row.id}>
                        <Td>
                          <Badge
                            tone={
                              row.type === 'prerequisite' ? 'brand' : row.type === 'corequisite' ? 'info' : 'gold'
                            }
                          >
                            {row.type === 'prerequisite'
                              ? t('متطلب سابق')
                              : row.type === 'corequisite'
                                ? t('متزامن')
                                : t('ساعات مطلوبة')}
                          </Badge>
                        </Td>
                        <Td className="font-mono text-xs">{row.required_course_code ?? '—'}</Td>
                        <Td className="text-xs">
                          {row.min_passed_credit_hours === null
                            ? '—'
                            : t('{{n}} ساعة', { n: formatInt(row.min_passed_credit_hours) })}
                        </Td>
                        <Td>
                          <IconButton
                            label={t('حذف المتطلب')}
                            onClick={() => removePrerequisite.mutate(row.id)}
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </IconButton>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle
              action={
                <Button size="sm" variant="outline" onClick={openNewOffering} icon={<CalendarDays className="h-4 w-4" />}>
                  {t('عرض فصلي جديد')}
                </Button>
              }
            >
              {t('العروض الفصلية')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {offerings.length === 0 ? (
              <EmptyState
                title={t('لا توجد عروض فصلية')}
                description={t('لن يظهر المقرر في خطط الفصول التي لا يوجد لها عرض.')}
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>{t('الفصل')}</Th>
                      <Th>{t('السعة')}</Th>
                      <Th>{t('المسجلون')}</Th>
                      <Th>{t('الحالة')}</Th>
                      <Th />
                    </Tr>
                  </THead>
                  <TBody>
                    {offerings.map((offering) => (
                      <Tr key={offering.id}>
                        <Td className="text-sm font-semibold">
                          {t(SEASONS[offering.season])} {offering.academic_year}
                        </Td>
                        <Td>{formatInt(offering.capacity)}</Td>
                        <Td>{formatInt(offering.enrolled_count)}</Td>
                        <Td>
                          <Badge
                            tone={
                              offering.status === 'open' ? 'success' : offering.status === 'closed' ? 'neutral' : 'danger'
                            }
                          >
                            {offering.status === 'open'
                              ? t('مفتوح')
                              : offering.status === 'closed'
                                ? t('مغلق')
                                : t('ملغي')}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingOffering(offering);
                                setCapacity(String(offering.capacity));
                                setOfferingStatus(offering.status);
                                setOfferingOpen(true);
                              }}
                            >
                              {t('تعديل')}
                            </Button>
                            <IconButton
                              label={t('حذف العرض')}
                              onClick={() => removeOffering.mutate(offering.id)}
                            >
                              <Trash2 className="h-4 w-4 text-danger" />
                            </IconButton>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t('متطلبات البرامج')}</CardTitle>
          </CardHeader>
          <CardContent>
            {requirements.length === 0 ? (
              <EmptyState
                title={t('غير مرتبط ببرنامج')}
                description={t('أضف المقرر إلى خطة برنامج من بيانات اللائحة.')}
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {requirements.map((row) => (
                  <div key={row.id} className="rounded-xl border border-ink-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="brand">{PROGRAM_LABELS[row.program].short}</Badge>
                      <span className="text-xs text-ink-500">{t(COURSE_ROLES[row.role] ?? row.role)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-ink-900">
                      {row.pool_code ?? t('مقرر إجباري')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={prereqOpen}
        onClose={() => setPrereqOpen(false)}
        title={t('إضافة متطلب')}
        description={t('المتطلب السابق يُطبّق بقاعدة A-CAT-09. المتطلب المتزامن استثناء محدود.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPrereqOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => addPrerequisite.mutate()}
              loading={addPrerequisite.isPending}
              disabled={prereqType === 'hours_required' ? !minHours : requiredCode.trim().length !== 7}
            >
              {t('إضافة')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {addPrerequisite.isError && <Alert tone="danger">{errorMessage(addPrerequisite.error)}</Alert>}
          <Select
            label={t('نوع المتطلب')}
            value={prereqType}
            onChange={(event) => setPrereqType(event.target.value as typeof prereqType)}
            options={[
              { value: 'prerequisite', label: t('متطلب سابق') },
              { value: 'corequisite', label: t('متطلب متزامن') },
              { value: 'hours_required', label: t('حد أدنى للساعات') },
            ]}
          />
          {prereqType === 'hours_required' ? (
            <Input
              label={t('الحد الأدنى للساعات المجتازة')}
              type="number"
              min={0}
              max={300}
              value={minHours}
              onChange={(event) => setMinHours(event.target.value)}
              required
            />
          ) : (
            <Input
              label={t('كود المقرر المطلوب')}
              dir="ltr"
              value={requiredCode}
              onChange={(event) => setRequiredCode(event.target.value.toUpperCase())}
              placeholder="CSC2101"
              maxLength={7}
              required
            />
          )}
          <Alert tone="info">
            {t(
              'المتطلب المتزامن يُقبل فقط إذا كان المقرر الناقص مسجلًا في نفس الفصل. الرسوب التاريخي لا يُستثنى.',
            )}
          </Alert>
        </div>
      </Modal>

      <Modal
        open={offeringOpen}
        onClose={() => {
          setOfferingOpen(false);
          setEditingOffering(null);
        }}
        title={editingOffering ? t('تعديل عرض فصلي') : t('عرض فصلي جديد')}
        description={
          editingOffering
            ? undefined
            : t('بعد إضافة العرض يمكن للطالب رؤية المقرر كخيار في ذلك الفصل.')
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOfferingOpen(false);
                setEditingOffering(null);
              }}
            >
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => saveOffering.mutate()}
              loading={saveOffering.isPending}
              disabled={!editingOffering && !/^\d{4}-\d{4}$/.test(academicYear.trim())}
            >
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {saveOffering.isError && <Alert tone="danger">{errorMessage(saveOffering.error)}</Alert>}
          {!editingOffering && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t('السنة الأكاديمية')}
                dir="ltr"
                value={academicYear}
                onChange={(event) => setAcademicYear(event.target.value)}
                placeholder="2026-2027"
                hint={t('الصيغة YYYY-YYYY')}
                required
              />
              <Select
                label={t('الفصل')}
                value={season}
                onChange={(event) => setSeason(event.target.value as Season)}
                options={[
                  { value: 'fall', label: t('خريف') },
                  { value: 'spring', label: t('ربيع') },
                  { value: 'summer', label: t('صيف') },
                ]}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t('السعة')}
              type="number"
              min={0}
              max={1000}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
            <Select
              label={t('الحالة')}
              value={offeringStatus}
              onChange={(event) => setOfferingStatus(event.target.value as typeof offeringStatus)}
              options={[
                { value: 'open', label: t('مفتوح') },
                { value: 'closed', label: t('مغلق') },
                { value: 'cancelled', label: t('ملغي') },
              ]}
            />
          </div>
          <p className="text-xs leading-5 text-ink-500">
            {t('إلغاء عرض لا يحذف سجلات التسجيل التاريخية. حذف العرض يزيله من الخطط المستقبلية فقط.')}
          </p>
        </div>
      </Modal>
    </div>
  );
}

function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() + 1 >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
