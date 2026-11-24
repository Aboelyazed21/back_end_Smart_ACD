import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { NotificationRow, Paginated } from '../../lib/types';
import { formatDate } from '../../lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/Page';
import { PaginationBar } from '../../components/ui/PaginationBar';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/format';

export function NotificationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['notifications', 'list', unreadOnly, page],
    queryFn: () =>
      api<Paginated<NotificationRow>>(
        `/student/notifications${qs({ unread: unreadOnly ? 'true' : undefined, page, limit: 20 })}`,
      ),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/student/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: invalidate,
    onError: (error) => toast.error(t('تعذر تحديث الإشعار'), errorMessage(error)),
  });

  const markAll = useMutation({
    mutationFn: () => api<{ data: { updated: number } }>('/student/notifications/read-all', { method: 'POST' }),
    onSuccess: async (data) => {
      toast.success(t('تم تعليم كل الإشعارات كمقروءة'), t('{{n}} إشعار.', { n: data.data.updated }));
      await invalidate();
    },
    onError: (error) => toast.error(t('تعذر تحديث الإشعارات'), errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        eyebrow={t('الإشعارات')}
        title={t('مركز الإشعارات')}
        description={t('تحديثات الخطط، حالات المراجعة، وطلبات الساعات المكتبية.')}
        actions={
          <>
            <Button
              variant={unreadOnly ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                setUnreadOnly((value) => !value);
                setPage(1);
              }}
            >
              {t('غير المقروءة فقط')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAll.mutate()}
              loading={markAll.isPending}
              icon={<CheckCheck className="h-4 w-4" />}
            >
              {t('تعليم الكل كمقروء')}
            </Button>
          </>
        }
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data?.data.length === 0 ? (
        <EmptyState
          title={t('لا توجد إشعارات')}
          description={unreadOnly ? t('كل الإشعارات مقروءة بالفعل.') : t('ستظهر هنا تحديثات الخطط والحالات.')}
          icon={<Bell className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <CardContent className="space-y-2">
            {query.data?.data.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4',
                  item.read_at ? 'border-ink-100 bg-surface' : 'border-brand-200 bg-brand-50/40',
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-ink-900">{item.title}</p>
                    <Badge tone={item.read_at ? 'neutral' : 'brand'}>
                      {item.read_at ? t('مقروء') : t('جديد')}
                    </Badge>
                    <Badge tone="neutral">{item.type}</Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-ink-600">{item.body}</p>
                  <p className="mt-1 text-[11px] text-ink-400">{formatDate(item.created_at, true)}</p>
                </div>
                {!item.read_at && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markRead.mutate(item.id)}
                    loading={markRead.isPending}
                  >
                    {t('تعليم كمقروء')}
                  </Button>
                )}
              </div>
            ))}
            {query.data && (
              <PaginationBar pagination={query.data.pagination} onPage={setPage} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
