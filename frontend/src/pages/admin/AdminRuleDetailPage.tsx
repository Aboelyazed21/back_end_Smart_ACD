import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookMarked } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { RegulationRuleDetail } from '../../lib/types';
import { formatDate } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { KeyValue } from '../../components/ui/Page';

export function AdminRuleDetailPage() {
  const { code = '' } = useParams();
  const query = useQuery({
    queryKey: ['admin', 'rule', code],
    queryFn: () => api<{ data: RegulationRuleDetail }>(`/admin/regulation/rules/${encodeURIComponent(code)}`),
    enabled: Boolean(code),
  });

  if (query.isLoading) return <LoadingBlock label="جارٍ تحميل القاعدة…" />;
  if (query.isError || !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const rule = query.data.data;
  const article = String(rule.article_no ?? '');
  const clause = rule.clause_no ? String(rule.clause_no) : '';
  const pageNo = String(rule.page_no ?? '');
  const createdAt = typeof rule.created_at === 'string' ? rule.created_at : undefined;
  const updatedAt = typeof rule.updated_at === 'string' ? rule.updated_at : undefined;

  return (
    <div>
      <Link
        to="/admin/rules"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowRight className="h-4 w-4" /> فهرس القواعد
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-brand-700">{rule.rule_code}</p>
          <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-950 sm:text-3xl">
            {rule.title_ar}
          </h1>
          {rule.title_en && (
            <p className="mt-1 text-sm text-ink-500" dir="ltr">
              {rule.title_en}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">مادة {article}</Badge>
          {clause && <Badge tone="info">بند {clause}</Badge>}
          <Badge tone="gold">صفحة {pageNo}</Badge>
          <Badge tone={rule.status === 'active' ? 'success' : 'neutral'}>
            {rule.status === 'active' ? 'سارية' : 'ملغاة'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>ملخص القاعدة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-bold text-ink-500">بالعربية</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-ink-800">{rule.summary_ar}</p>
            </div>
            {rule.summary_en && (
              <div>
                <p className="text-xs font-bold text-ink-500">English</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-ink-600" dir="ltr">
                  {rule.summary_en}
                </p>
              </div>
            )}
            <Alert tone="info" icon={<BookMarked className="h-4 w-4" />}>
              هذه القاعدة مرجع ثابت للقرارات. لا تُعدّل من الواجهة؛ أي تغيير يتطلب تحديث بيانات اللائحة وإعادة الاستيراد.
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>المرجع</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label="كود القاعدة" value={<span className="font-mono">{rule.rule_code}</span>} />
              <KeyValue label="المادة" value={article} />
              <KeyValue label="البند" value={clause || '—'} />
              <KeyValue label="الصفحة" value={pageNo} />
              <KeyValue label="الحالة" value={rule.status === 'active' ? 'سارية' : 'ملغاة'} />
              {createdAt && <KeyValue label="أُضيفت" value={formatDate(createdAt)} />}
              {updatedAt && <KeyValue label="آخر تحديث" value={formatDate(updatedAt)} />}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
