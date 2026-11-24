import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.success(
        t('تم حل التعارض'),
        t('{{n}} قرار أُعيد تقييمه وحُوّل إلى نتيجة نهائية.', { n: payload.data.autoResolved }),
      );
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر حل التعارض'), errorMessage(error)),
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
      toast.success(t('أُعيد فتح التعارض'), t('ستعود القرارات المتأثرة إلى REVIEW_REQUIRED.'));
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر إعادة الفتح'), errorMessage(error)),
  });

  if (query.isLoading) return <LoadingBlock label={t('جارٍ تحميل التعارض…')} />;
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
        <ArrowRight className="h-4 w-4" /> {t('كل التعارضات')}
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
          <Badge tone={(severityMeta?.tone as never) ?? 'neutral'}>
            {t(severityMeta?.ar ?? anomaly.severity)}
          </Badge>
          <Badge tone={anomaly.status === 'open' ? 'warning' : 'success'}>
            {anomaly.status === 'open' ? t('مفتوح') : t('محلول')}
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
              {t('حل التعارض')}
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
              {t('إعادة الفتح')}
            </Button>
          )}
        </div>
      </div>

      {result && (
        <Alert
          tone={result.errors.length > 0 ? 'warning' : 'success'}
          className="mb-4"
          title={t('نتيجة إعادة التقييم')}
        >
          {t(
            'أُعيد تقييم {{reEvaluated}} قرارًا — حُوّل {{autoResolved}} إلى نتيجة نهائية، ولا يزال {{stillReview}} بانتظار المراجعة.',
            {
              reEvaluated: result.reEvaluated,
              autoResolved: result.autoResolved,
              stillReview: result.stillReview,
            },
          )}
          {result.errors.length > 0 && (
            <span className="block">{t('أخطاء: {{errors}}', { errors: result.errors.join(' · ') })}</span>
          )}
        </Alert>
      )}

      {anomaly.severity === 'blocking' && anomaly.status === 'open' && (
        <Alert tone="danger" className="mb-4" icon={<TriangleAlert className="h-4 w-4" />}>
          {t(
            'هذا تعارض مانع: كل قرار مرتبط به يُعاد كـ REVIEW_REQUIRED وتُنشأ حالة محوّلة للمرشد. لا يمكن تجاوز القاعدة.',
          )}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('الوصف')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-7 text-ink-700">{anomaly.description_ar}</p>
            {anomaly.description_en && (
              <p className="whitespace-pre-wrap text-sm leading-7 text-ink-500" dir="ltr">
                {anomaly.description_en}
              </p>
            )}
            {anomaly.suggested_resolution && (
              <Alert tone="info" title={t('حل مقترح')}>
                {anomaly.suggested_resolution}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('البيانات')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label={t('الحالة')} value={anomaly.status === 'open' ? t('مفتوح') : t('محلول')} />
              <KeyValue label={t('الخطورة')} value={t(severityMeta?.ar ?? anomaly.severity)} />
              <KeyValue label={t('النوع')} value={anomaly.type} />
              <KeyValue label={t('أُنشئ')} value={formatDate(anomaly.created_at, true)} />
              <KeyValue label={t('آخر تحديث')} value={formatDate(anomaly.updated_at, true)} />
              {anomaly.resolved_at && <KeyValue label={t('حُلّ في')} value={formatDate(anomaly.resolved_at, true)} />}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('القيم')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-bold text-ink-500">{t('القيمة العاملة')}</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-ink-50 p-2.5 text-sm text-ink-800">
                {anomaly.working_value ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-ink-500">{t('القيمة المحلولة')}</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-900">
                {anomaly.resolved_value ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-ink-500">{t('سلوك المحرك')}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-700">
                {anomaly.engine_behavior ?? '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('التأثير')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-bold text-ink-500">{t('المقررات')}</p>
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
              <p className="mb-1 text-xs font-bold text-ink-500">{t('القواعد')}</p>
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
            <CardTitle>{t('المصادر الأصلية')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={anomaly.sources} />
          </CardContent>
        </Card>
      </div>

      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title={t('حل التعارض')}
        description={t('اكتب القيمة المعتمدة بعد مراجعة اللائحة. سيُعاد تقييم كل القرارات المتأثرة تلقائيًا.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => resolve.mutate()}
              loading={resolve.isPending}
              disabled={resolvedValue.trim().length < 2}
            >
              {t('حل وإعادة التقييم')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {resolve.isError && <Alert tone="danger">{errorMessage(resolve.error)}</Alert>}
          <Textarea
            label={t('القيمة المحلولة')}
            value={resolvedValue}
            onChange={(event) => setResolvedValue(event.target.value)}
            maxLength={5000}
            required
            placeholder={t('القيمة المعتمدة من اللائحة، مثل: 3 ساعات معتمدة')}
          />
          <Textarea
            label={t('ملاحظة المراجعة (اختياري)')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            placeholder={t('مرجع المراجعة أو سبب اعتماد القيمة…')}
          />
          <Alert tone="warning">
            {t(
              'الحل يُسجّل في سجل التدقيق ويحتفظ بالقيمة العاملة الأصلية والمصادر. لا يمكن التراجع دون إعادة فتح موثّقة.',
            )}
          </Alert>
        </div>
      </Modal>

      <Modal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title={t('إعادة فتح التعارض')}
        description={t('إعادة الفتح تعيد القرارات المرتبطة إلى REVIEW_REQUIRED. وثّق السبب.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              variant="danger"
              onClick={() => reopen.mutate()}
              loading={reopen.isPending}
              disabled={reason.trim().length < 3}
            >
              {t('إعادة الفتح')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {reopen.isError && <Alert tone="danger">{errorMessage(reopen.error)}</Alert>}
          <Textarea
            label={t('سبب إعادة الفتح')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            required
            placeholder={t('ظهرت بيانات جديدة تخالف الحل السابق…')}
          />
        </div>
      </Modal>
    </div>
  );
}
