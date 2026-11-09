import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { AuthSessionRow } from '../lib/types';
import { PROGRAM_LABELS, ROLE_LABELS } from '../lib/constants';
import { formatDate, formatInt } from '../lib/format';
import { passwordChecks } from '../lib/password';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { KeyValue, PageHeader } from '../components/ui/Page';
import { useToast } from '../components/ui/Toast';

export function SettingsPage() {
  const { user, me, reloadMe, logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);

  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api<{ items: AuthSessionRow[] }>('/auth/sessions'),
    enabled: Boolean(user),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
    onSuccess: async () => {
      toast.success(
        'تم تغيير كلمة المرور',
        'أُنهيت كل جلسات التجديد. أكمل عملك الحالي ثم سجّل الدخول من جديد عند انتهاء الجلسة.',
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      await reloadMe();
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (error) => toast.error('تعذر تغيير كلمة المرور', errorMessage(error)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('تم إنهاء الجلسة');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (error) => toast.error('تعذر إنهاء الجلسة', errorMessage(error)),
  });

  const endAll = useMutation({
    mutationFn: () => logoutAll(),
    onSuccess: () => {
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error('تعذر إنهاء الجلسات', errorMessage(error)),
  });

  const checks = passwordChecks(newPassword);
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const canChange = currentPassword.length > 0 && checks.every((check) => check.ok) && !mismatch;

  const rows = sessions.data?.items ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="إعدادات الحساب"
        title="الأمان والملف الشخصي"
        description="بياناتك تُدار مركزيًا من إدارة الكلية. يمكنك هنا تغيير كلمة المرور ومراجعة الجلسات النشطة وإنهائها."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>الملف الشخصي</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label="الاسم" value={user?.fullName ?? '—'} />
              <KeyValue label="البريد" value={<span dir="ltr">{user?.email ?? '—'}</span>} />
              <KeyValue label="الدور" value={user ? ROLE_LABELS[user.role] : '—'} />
              <KeyValue
                label="الحالة"
                value={
                  <Badge tone={user?.status === 'active' ? 'success' : 'neutral'}>
                    {user?.status === 'active' ? 'نشط' : user?.status === 'suspended' ? 'موقوف' : 'غير نشط'}
                  </Badge>
                }
              />
              <KeyValue label="الهاتف" value={<span dir="ltr">{user?.phone ?? '—'}</span>} />
              <KeyValue label="أُنشئ" value={formatDate(user?.createdAt)} />
              {user?.isDemo && <KeyValue label="الحساب" value={<Badge tone="neutral">تجريبي</Badge>} />}
            </dl>

            {me?.student && (
              <div className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-6 text-brand-900">
                <p className="font-bold">بيانات الطالب</p>
                <p>
                  {me.student.student_code} · {PROGRAM_LABELS[me.student.program].ar} · المستوى{' '}
                  {formatInt(me.student.level)}
                </p>
                <p>
                  CGPA {me.student.current_cgpa ?? '—'} · {formatInt(me.student.passed_credits)} ساعة مجتازة
                </p>
              </div>
            )}
            {me?.advisor && (
              <div className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-6 text-brand-900">
                <p className="font-bold">بيانات المرشد</p>
                <p>المكتب: {me.advisor.office_location ?? '—'}</p>
                <p>الحد الأقصى للطلاب: {formatInt(me.advisor.max_students)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle action={<Badge tone={user?.mustChangePassword ? 'warning' : 'success'}>
              {user?.mustChangePassword ? 'تغيير مطلوب' : 'آمن'}
            </Badge>}>
              تغيير كلمة المرور
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (canChange) changePassword.mutate();
              }}
            >
              {changePassword.isError && <Alert tone="danger">{errorMessage(changePassword.error)}</Alert>}
              {user?.mustChangePassword && (
                <Alert tone="warning" title="كلمة مرور مؤقتة">
                  يجب تغيير كلمة المرور المؤقتة قبل متابعة الاستخدام. اختر كلمة مرور جديدة لا تشبه السابقة.
                </Alert>
              )}
              <Input
                label="كلمة المرور الحالية"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                leading={<KeyRound className="h-4 w-4" />}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="كلمة المرور الجديدة"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  leading={<ShieldCheck className="h-4 w-4" />}
                  required
                />
                <Input
                  label="تأكيد كلمة المرور"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  error={mismatch ? 'كلمتا المرور غير متطابقتين' : undefined}
                  required
                />
              </div>
              <ul className="grid gap-1.5 rounded-xl bg-ink-50 p-3 text-xs sm:grid-cols-2">
                {checks.map((check) => (
                  <li key={check.label} className={check.ok ? 'font-semibold text-emerald-700' : 'text-ink-500'}>
                    {check.ok ? '✓' : '•'} {check.label}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] leading-5 text-ink-500">
                  تغيير كلمة المرور يُبطل كل رموز التجديد الحالية للحساب.
                </p>
                <Button type="submit" loading={changePassword.isPending} disabled={!canChange}>
                  تغيير كلمة المرور
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle
              action={
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setLogoutOpen(true)}
                  icon={<LogOut className="h-4 w-4" />}
                >
                  إنهاء كل الجلسات
                </Button>
              }
            >
              الجلسات النشطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <LoadingBlock />
            ) : sessions.isError ? (
              <ErrorState message={errorMessage(sessions.error)} onRetry={() => void sessions.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState title="لا توجد جلسات" description="لم يُعثر على جلسات نشطة." />
            ) : (
              <div className="grid gap-2">
                {rows.map((session) => {
                  const active = !session.revoked_at && new Date(session.expires_at) > new Date();
                  const mobile = /android|iphone|ipad|mobile/i.test(session.user_agent ?? '');
                  return (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-50 text-ink-600">
                          {mobile ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-md truncate text-sm font-semibold text-ink-900" dir="ltr">
                            {session.user_agent ?? 'عميل غير معروف'}
                          </p>
                          <p className="text-[11px] text-ink-500" dir="ltr">
                            {session.ip ?? '—'} · أُنشئت {formatDate(session.created_at, true)}
                          </p>
                          <p className="text-[11px] text-ink-400">
                            تنتهي {formatDate(session.expires_at, true)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={active ? 'success' : 'neutral'}>{active ? 'نشطة' : 'منتهية'}</Badge>
                        {active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => revoke.mutate(session.id)}
                            loading={revoke.isPending && revoke.variables === session.id}
                          >
                            إنهاء
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="إنهاء كل الجلسات"
        description="سيتم تسجيل الخروج من هذا الجهاز وكل الأجهزة الأخرى فورًا."
        footer={
          <>
            <Button variant="ghost" onClick={() => setLogoutOpen(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={() => endAll.mutate()} loading={endAll.isPending}>
              إنهاء الكل والخروج
            </Button>
          </>
        }
      >
        <Alert tone="warning">
          أي عمل غير محفوظ سيُفقد. ستحتاج إلى تسجيل الدخول مجددًا للمتابعة.
        </Alert>
      </Modal>
    </div>
  );
}
