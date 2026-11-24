import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyRound, LogOut, Monitor, Pencil, ShieldCheck, Smartphone } from 'lucide-react';
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

interface StudentProfile {
  fullName: string;
  phone: string | null;
}

export function SettingsPage() {
  const { user, me, reloadMe, logoutAll } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const isStudent = user?.role === 'student';

  const profile = useQuery({
    queryKey: ['student', 'profile'],
    queryFn: () => api<{ data: { student: StudentProfile } }>('/student/profile'),
    enabled: isStudent,
  });

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
        t('تم تغيير كلمة المرور'),
        t('أُنهيت كل جلسات التجديد. أكمل عملك الحالي ثم سجّل الدخول من جديد عند انتهاء الجلسة.'),
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      await reloadMe();
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (error) => toast.error(t('تعذر تغيير كلمة المرور'), errorMessage(error)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('تم إنهاء الجلسة'));
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (error) => toast.error(t('تعذر إنهاء الجلسة'), errorMessage(error)),
  });

  const endAll = useMutation({
    mutationFn: () => logoutAll(),
    onSuccess: () => {
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(t('تعذر إنهاء الجلسات'), errorMessage(error)),
  });

  const updateProfile = useMutation({
    mutationFn: () =>
      api('/student/profile', {
        method: 'PATCH',
        body: { fullName: fullName.trim(), phone: phone.trim() || null },
      }),
    onSuccess: async () => {
      toast.success(t('تم تحديث بيانات التواصل'));
      setProfileOpen(false);
      await reloadMe();
      await queryClient.invalidateQueries({ queryKey: ['student', 'profile'] });
    },
    onError: (error) => toast.error(t('تعذر تحديث البيانات'), errorMessage(error)),
  });

  const checks = passwordChecks(newPassword);
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const canChange = currentPassword.length > 0 && checks.every((check) => check.ok) && !mismatch;

  const rows = sessions.data?.items ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={t('إعدادات الحساب')}
        title={t('الأمان والملف الشخصي')}
        description={t(
          'بياناتك تُدار مركزيًا من إدارة الكلية. يمكنك هنا تغيير كلمة المرور ومراجعة الجلسات النشطة وإنهائها.',
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle
              action={
                isStudent ? (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => {
                      setFullName(profile.data?.data.student.fullName ?? user?.fullName ?? '');
                      setPhone(profile.data?.data.student.phone ?? user?.phone ?? '');
                      setProfileOpen(true);
                    }}
                  >
                    {t('تعديل')}
                  </Button>
                ) : undefined
              }
            >
              {t('الملف الشخصي')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <KeyValue label={t('الاسم')} value={user?.fullName ?? '—'} />
              <KeyValue label={t('البريد')} value={<span dir="ltr">{user?.email ?? '—'}</span>} />
              <KeyValue label={t('الدور')} value={user ? t(ROLE_LABELS[user.role]) : '—'} />
              <KeyValue
                label={t('الحالة')}
                value={
                  <Badge tone={user?.status === 'active' ? 'success' : 'neutral'}>
                    {user?.status === 'active'
                      ? t('نشط')
                      : user?.status === 'suspended'
                        ? t('موقوف')
                        : t('غير نشط')}
                  </Badge>
                }
              />
              <KeyValue label={t('الهاتف')} value={<span dir="ltr">{user?.phone ?? '—'}</span>} />
              <KeyValue label={t('أُنشئ')} value={formatDate(user?.createdAt)} />
            </dl>

            {me?.student && (
              <div className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-6 text-brand-900">
                <p className="font-bold">{t('بيانات الطالب')}</p>
                <p>
                  {me.student.student_code} · {t(PROGRAM_LABELS[me.student.program].ar)} · {t('المستوى')}{' '}
                  {formatInt(me.student.level)}
                </p>
                <p>
                  CGPA {me.student.current_cgpa ?? '—'} · {formatInt(me.student.passed_credits)}{' '}
                  {t('ساعة مجتازة')}
                </p>
              </div>
            )}
            {me?.advisor && (
              <div className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-6 text-brand-900">
                <p className="font-bold">{t('بيانات المرشد')}</p>
                <p>
                  {t('المكتب')}: {me.advisor.office_location ?? '—'}
                </p>
                <p>
                  {t('الحد الأقصى للطلاب')}: {formatInt(me.advisor.max_students)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle
              action={
                <Badge tone={user?.mustChangePassword ? 'warning' : 'success'}>
                  {user?.mustChangePassword ? t('تغيير مطلوب') : t('آمن')}
                </Badge>
              }
            >
              {t('تغيير كلمة المرور')}
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
                <Alert tone="warning" title={t('كلمة مرور مؤقتة')}>
                  {t('يجب تغيير كلمة المرور المؤقتة قبل متابعة الاستخدام. اختر كلمة مرور جديدة لا تشبه السابقة.')}
                </Alert>
              )}
              <Input
                label={t('كلمة المرور الحالية')}
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
                  label={t('كلمة المرور الجديدة')}
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  leading={<ShieldCheck className="h-4 w-4" />}
                  required
                />
                <Input
                  label={t('تأكيد كلمة المرور')}
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  error={mismatch ? t('كلمتا المرور غير متطابقتين') : undefined}
                  required
                />
              </div>
              <ul className="grid gap-1.5 rounded-xl bg-ink-50 p-3 text-xs sm:grid-cols-2">
                {checks.map((check) => (
                  <li key={check.label} className={check.ok ? 'font-semibold text-emerald-700' : 'text-ink-500'}>
                    {check.ok ? '✓' : '•'} {t(check.label)}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] leading-5 text-ink-500">
                  {t('تغيير كلمة المرور يُبطل كل رموز التجديد الحالية للحساب.')}
                </p>
                <Button type="submit" loading={changePassword.isPending} disabled={!canChange}>
                  {t('تغيير كلمة المرور')}
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
                  {t('إنهاء كل الجلسات')}
                </Button>
              }
            >
              {t('الجلسات النشطة')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <LoadingBlock />
            ) : sessions.isError ? (
              <ErrorState message={errorMessage(sessions.error)} onRetry={() => void sessions.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState title={t('لا توجد جلسات')} description={t('لم يُعثر على جلسات نشطة.')} />
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
                            {session.user_agent ?? t('عميل غير معروف')}
                          </p>
                          <p className="text-[11px] text-ink-500" dir="ltr">
                            {session.ip ?? '—'} · {t('أُنشئت')} {formatDate(session.created_at, true)}
                          </p>
                          <p className="text-[11px] text-ink-400">
                            {t('تنتهي')} {formatDate(session.expires_at, true)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={active ? 'success' : 'neutral'}>
                          {active ? t('نشطة') : t('منتهية')}
                        </Badge>
                        {active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => revoke.mutate(session.id)}
                            loading={revoke.isPending && revoke.variables === session.id}
                          >
                            {t('إنهاء')}
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
        title={t('إنهاء كل الجلسات')}
        description={t('سيتم تسجيل الخروج من هذا الجهاز وكل الأجهزة الأخرى فورًا.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLogoutOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button variant="danger" onClick={() => endAll.mutate()} loading={endAll.isPending}>
              {t('إنهاء الكل والخروج')}
            </Button>
          </>
        }
      >
        <Alert tone="warning">
          {t('أي عمل غير محفوظ سيُفقد. ستحتاج إلى تسجيل الدخول مجددًا للمتابعة.')}
        </Alert>
      </Modal>

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={t('تعديل بيانات التواصل')}
        description={t('يمكنك تعديل الاسم ورقم الهاتف فقط. باقي بياناتك تُدار من إدارة الكلية.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => updateProfile.mutate()}
              loading={updateProfile.isPending}
              disabled={fullName.trim().length < 2}
            >
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {updateProfile.isError && <Alert tone="danger">{errorMessage(updateProfile.error)}</Alert>}
          <Input
            label={t('الاسم الكامل')}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={200}
            required
          />
          <Input
            label={t('رقم الهاتف')}
            type="tel"
            dir="ltr"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={30}
            placeholder="01000000000"
          />
          <Alert tone="info">{t('لا يمكن تغيير البريد أو الرقم الجامعي أو البرنامج من هنا.')}</Alert>
        </div>
      </Modal>
    </div>
  );
}
