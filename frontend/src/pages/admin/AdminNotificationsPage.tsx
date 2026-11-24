import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Megaphone, Send } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { Table, TableWrap, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';

const AUDIENCES = [
  { value: 'all', label: 'كل المستخدمين' },
  { value: 'students', label: 'الطلاب' },
  { value: 'advisors', label: 'المرشدون' },
  { value: 'admins', label: 'الإدارة' },
];

interface BroadcastRow {
  created_at: string;
  title: string;
  body: string;
  recipients: number;
  created_by_name: string | null;
}

export function AdminNotificationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [audience, setAudience] = useState('students');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(false);

  const history = useQuery({
    queryKey: ['admin', 'notifications', 'broadcasts'],
    queryFn: () => api<{ data: BroadcastRow[] }>('/admin/notifications/broadcasts'),
  });

  const broadcast = useMutation({
    mutationFn: () =>
      api<{ data: { recipients: number; emailed: number } }>('/admin/notifications/broadcast', {
        method: 'POST',
        body: {
          audience,
          title: title.trim(),
          body: body.trim(),
          ...(sendEmail ? { sendEmail: true } : {}),
        },
      }),
    onSuccess: async (payload) => {
      toast.success(
        t('تم إرسال الإعلان'),
        t('{{n}} مستلم — الإعلانات لا تُعدّل ولا تُحذف من سجل المستلمين.', {
          n: payload.data.recipients,
        }),
      );
      setTitle('');
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'broadcasts'] });
    },
    onError: (error) => toast.error(t('تعذر إرسال الإعلان'), errorMessage(error)),
  });

  const rows = history.data?.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={t('إدارة النظام')}
        title={t('الإعلانات والإشعارات')}
        description={t(
          'أرسل إعلانًا داخل التطبيق إلى مجموعة محددة من المستخدمين، مع إمكانية إرساله بالبريد الإلكتروني. يُحفظ كل إعلان في السجل مع عدد المستلمين.',
        )}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('إرسال إعلان')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (title.trim() && body.trim()) broadcast.mutate();
              }}
            >
              {broadcast.isError && <Alert tone="danger">{errorMessage(broadcast.error)}</Alert>}
              <Select
                label={t('الفئة المستهدفة')}
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                options={AUDIENCES.map((item) => ({ value: item.value, label: t(item.label) }))}
              />
              <Input
                label={t('العنوان')}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
              <Textarea
                label={t('نص الإعلان')}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={2000}
                rows={5}
                placeholder={t('مثال: يبدأ التسجيل في الفصل القادم يوم الأحد…')}
                required
              />
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(event) => setSendEmail(event.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600"
                />
                {t('إرسال نسخة بالبريد الإلكتروني')}
              </label>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  loading={broadcast.isPending}
                  disabled={!title.trim() || !body.trim()}
                  icon={<Send className="h-4 w-4" />}
                >
                  {t('إرسال الإعلان')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('سجل الإعلانات')}</CardTitle>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <LoadingBlock />
            ) : history.isError ? (
              <ErrorState message={errorMessage(history.error)} onRetry={() => void history.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState
                title={t('لم تُرسل إعلانات بعد')}
                description={t('سيظهر هنا كل إعلان أرسلته مع عدد المستلمين.')}
                icon={<Megaphone className="h-6 w-6" />}
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <Tr>
                      <Th>{t('الوقت')}</Th>
                      <Th>{t('العنوان')}</Th>
                      <Th>{t('المستلمون')}</Th>
                      <Th>{t('المرسل')}</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <Tr key={`${row.created_at}-${row.title}`}>
                        <Td className="whitespace-nowrap text-xs">{formatDate(row.created_at, true)}</Td>
                        <Td>
                          <p className="text-sm font-semibold text-ink-900">{row.title}</p>
                          <p className="line-clamp-2 text-xs text-ink-500">{row.body}</p>
                        </Td>
                        <Td>
                          <Badge tone="brand">{row.recipients}</Badge>
                        </Td>
                        <Td className="text-xs">{row.created_by_name ?? t('النظام')}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
