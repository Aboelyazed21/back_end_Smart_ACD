import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { DataAnomaly } from '../../lib/types';
import { SEVERITY_LABELS } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { KeyValue, JsonBlock } from '../../components/ui/Page';
import { useToast } from '../../components/ui/Toast';

interface ResolveResult {
  anomaly: DataAnomaly;
  reEvaluated: number;
  autoResolved: number;
  stillReview: number;
  errors: string[];
}

export function AdminAnomalyDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolvedValue, setResolvedValue] = useState('');
  const [note, setNote] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<ResolveResult | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'anomaly', id],
    queryFn: () => api<{ data: DataAnomaly }>(`/admin/anomalies/${id}`),
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'anomaly', id] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'anomalies'] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] });
  };

  const resolve = useMutation({
    mutationFn: () =>
      api<{ data: ResolveResult }>(`/admin/anomalies/${id}/resolve`, {
        method: 'PATCH',
        body: {
          resolvedValue: resolvedValue.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: async (payload) => {
      setResult(payload.data);
      setResolveOpen(false);
      toast.success('تم حل التعارض', `${payload.data.autoResolved} قرار أُعيد تقييمه وحُوّل إلى نتيجة نهائية.`);
      await invalidate();
    },
    onError: (error) => toast.error('تعذر حل التعارض', errorMessage(error)),
  });

  const reopen = useMutation({
    mutationFn: () =>
      api(`/admin/anomalies/${id}/reopen`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: async () => {
      setReopenOpen(false);
      setReason('');
      setResult(null);
      toast.success('أُعيد فتح التعارض', 'ستعود القرارات المتأثرة إلى REVIEW_REQUIRED.');
      await invalidate();
    },
    onError: (error) => toast.error('تعذر إعادة الفتح', errorMessage(error)),
  });

  if (query.isLoading) return <LoadingBlock label="جارٍ تحميل التعارض…" />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const anomaly = query.data.data;
  const severityMeta = SEVERITY_LABELS[anomaly.severity];

  return (
    <div>
      <Link
        to="/admin/anomalies"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowRight className="h-4 w-4" /> كل التعارضات
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-brand-700">{anomaly.id}</p>
          <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-950 sm:text-3xl">
            {anomaly.title_ar}
          </h1>
          {anomaly.title_en && (
            <p className="mt-1 text-sm text-ink-500" dir="ltr">
              {anomaly.title_en}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={(severityMeta?.tone as never) ?? 'neutral'}>{severityMeta?.ar ?? anomaly.severity}</Badge>
          <Badge tone={anomaly.status === 'open' ? 'warning' : 'success'}>
            {anomaly.status === 'open' ? 'مفتوح' : 'محلول'}
          </Badge>
          <Badge tone="neutral" className="font-mono text-[10px]">
            {anomaly.type}
          </Badge>
          {anomaly.status === 'open' ? (
            <Button
              onClick={() => {
                setResolvedValue(anomaly.resolved_value ?? anomaly.working_value ?? '');
                setResolveOpen(true);
              }}
              icon={<ShieldCheck className="h-4 w-4" />}
            >
              حل التعارض
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setReason('');
                setReopenOpen(true);
              }}
              icon={<RotateCcw className="h-4 w-4" />}
            >
              إعادة الفتح
            </Button>
          )}
        </div>
      </div>

      {result && (
        <Alert
          tone={result.errors.length > 0 ? 'warning' : 'success'}
          className="mb-4"
          title="نتيجة إعادة التقييم"
        >
          أُعيد تقييم {result.reEvaluated} قرارًا — حُوّل {result.autoResolved} إلى نتيجة نهائية، ولا يزال{' '}
          {result.stillReview} بانتظار المراجعة.
          {result.errors.length > 0 && <span className="block">أخطاء: {result.errors.join(' · ')}</span>}
        </Alert>
      )}

      {anomaly.severity === 'blocking' && anomaly.status === 'open' && (
        <Alert tone="danger" className="mb-4" icon={<TriangleAlert className="h-4 w-4" />}>
          هذا تعارض مانع: كل قرار مرتبط به يُعاد كـ REVIEW_REQUIRED وتُنشأ حالة محوّلة للمرشد. لا يمكن تجاوز القاعدة.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>الوصف</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-7 text-ink-700">{anomaly.description_ar}</p>
            {anomaly.description_en && (
              <p className="whitespace-pre-wrap text-sm leading-7 text-ink-500" dir="ltr">
                {anomaly.description_en}
              </p>
            )}
            {anomaly.suggested_resolution && (
              <Alert tone="info" title="حل مقترح">
                {anomaly.suggested_resolution}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>البيانات</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label="الحالة" value={anomaly.status === 'open' ? 'مفتوح' : 'محلول'} />
              <KeyValue label="الخطورة" value={severityMeta?.ar ?? anomaly.severity} />
              <KeyValue label="النوع" value={anomaly.type} />
              <KeyValue label="أُنشئ" value={formatDate(anomaly.created_at, true)} />
              <KeyValue label="آخر تحديث" value={formatDate(anomaly.updated_at, true)} />
              {anomaly.resolved_at && <KeyValue label="حُلّ في" value={formatDate(anomaly.resolved_at, true)} />}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>القيم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-bold text-ink-500">القيمة العاملة</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-ink-50 p-2.5 text-sm text-ink-800">
                {anomaly.working_value ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-ink-500">القيمة المحلولة</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-900">
                {anomaly.resolved_value ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-ink-500">سلوك المحرك</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-700">
                {anomaly.engine_behavior ?? '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>التأثير</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-bold text-ink-500">المقررات</p>
              {anomaly.affected_courses.length === 0 ? (
                <p className="text-sm text-ink-400">—</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {anomaly.affected_courses.map((code) => (
                    <Badge key={code} tone="brand" className="font-mono text-[11px]">
                      {code}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-ink-500">القواعد</p>
              {anomaly.affected_rules.length === 0 ? (
                <p className="text-sm text-ink-400">—</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {anomaly.affected_rules.map((code) => (
                    <Link key={code} to={`/admin/rules/${encodeURIComponent(code)}`}>
                      <Badge tone="warning" className="font-mono text-[11px]">
                        {code}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>المصادر الأصلية</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={anomaly.sources} />
          </CardContent>
        </Card>
      </div>

      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title="حل التعارض"
        description="اكتب القيمة المعتمدة بعد مراجعة اللائحة. سيُعاد تقييم كل القرارات المتأثرة تلقائيًا."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => resolve.mutate()}
              loading={resolve.isPending}
              disabled={resolvedValue.trim().length < 2}
            >
              حل وإعادة التقييم
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {resolve.isError && <Alert tone="danger">{errorMessage(resolve.error)}</Alert>}
          <Textarea
            label="القيمة المحلولة"
            value={resolvedValue}
            onChange={(event) => setResolvedValue(event.target.value)}
            maxLength={5000}
            required
            placeholder="القيمة المعتمدة من اللائحة، مثل: 3 ساعات معتمدة"
          />
          <Textarea
            label="ملاحظة المراجعة (اختياري)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            placeholder="مرجع المراجعة أو سبب اعتماد القيمة…"
          />
          <Alert tone="warning">
            الحل يُسجّل في سجل التدقيق ويحتفظ بالقيمة العاملة الأصلية والمصادر. لا يمكن التراجع دون إعادة فتح موثّقة.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="إعادة فتح التعارض"
        description="إعادة الفتح تعيد القرارات المرتبطة إلى REVIEW_REQUIRED. وثّق السبب."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              onClick={() => reopen.mutate()}
              loading={reopen.isPending}
              disabled={reason.trim().length < 3}
            >
              إعادة الفتح
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {reopen.isError && <Alert tone="danger">{errorMessage(reopen.error)}</Alert>}
          <Textarea
            label="سبب إعادة الفتح"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            required
            placeholder="ظهرت بيانات جديدة تخالف الحل السابق…"
          />
        </div>
      </Modal>
    </div>
  );
}
