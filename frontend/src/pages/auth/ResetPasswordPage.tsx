import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Alert } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from './AuthLayout';
import { passwordChecks } from '../../lib/password';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api('/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: password },
        skipRefresh: true,
      }),
    onSuccess: () => {
      window.setTimeout(() => navigate('/login', { replace: true }), 1200);
    },
  });

  const checks = passwordChecks(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <AuthLayout
      title="تعيين كلمة مرور جديدة"
      subtitle="اختر كلمة مرور قوية. سيتم إنهاء جميع الجلسات الحالية للحساب بعد التغيير."
      footer={
        <Link to="/login" className="font-bold text-brand-700 hover:text-brand-900">
          رجوع إلى تسجيل الدخول
        </Link>
      }
    >
      {!token ? (
        <Alert tone="danger" title="رابط غير صالح">
          رابط إعادة التعيين غير مكتمل. اطلب رابطًا جديدًا من صفحة نسيت كلمة المرور.
        </Alert>
      ) : mutation.isSuccess ? (
        <Alert tone="success" title="تم تغيير كلمة المرور">
          يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة. سيتم تحويلك تلقائيًا…
        </Alert>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!mismatch && checks.every((check) => check.ok)) mutation.mutate();
          }}
          className="space-y-4"
          noValidate
        >
          {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}

          <div className="relative">
            <Input
              label="كلمة المرور الجديدة"
              type={show ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              leading={<KeyRound className="h-4 w-4" />}
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              className="absolute end-3 top-[34px] rounded p-1 text-ink-400 hover:text-ink-700"
              aria-label="إظهار كلمة المرور"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <Input
            label="تأكيد كلمة المرور"
            type={show ? 'text' : 'password'}
            dir="ltr"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={mismatch ? 'كلمتا المرور غير متطابقتين' : undefined}
            leading={<ShieldCheck className="h-4 w-4" />}
          />

          <ul className="grid gap-1.5 rounded-xl bg-ink-50 p-3 text-xs">
            {checks.map((check) => (
              <li key={check.label} className={check.ok ? 'font-semibold text-emerald-700' : 'text-ink-500'}>
                {check.ok ? '✓' : '•'} {check.label}
              </li>
            ))}
          </ul>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={mutation.isPending}
            disabled={!checks.every((check) => check.ok) || mismatch}
          >
            تعيين كلمة المرور
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
