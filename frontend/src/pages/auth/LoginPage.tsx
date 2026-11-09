import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage } from '../../lib/api';
import { HOME_BY_ROLE } from '../../lib/constants';
import { Alert } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from './AuthLayout';

const DEMO_ACCOUNTS = [
  { label: 'طالب', email: 'student1@aidm.bua.edu.eg' },
  { label: 'مرشد', email: 'advisor1@aidm.bua.edu.eg' },
  { label: 'مسؤول', email: 'admin@bua.edu.eg' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: (user) => {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : HOME_BY_ROLE[user.role], { replace: true });
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };

  return (
    <AuthLayout
      title="تسجيل الدخول"
      subtitle="استخدم البريد الجامعي وكلمة المرور للوصول إلى لوحة الإرشاد الأكاديمي."
      footer={
        <span>
          لا تملك حسابًا؟ تُنشأ الحسابات من قِبل إدارة الكلية.{' '}
          <Link to="/forgot-password" className="font-bold text-brand-700 hover:text-brand-900">
            نسيت كلمة المرور؟
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}

        <Input
          label="البريد الإلكتروني"
          type="email"
          inputMode="email"
          autoComplete="username"
          dir="ltr"
          placeholder="student1@aidm.bua.edu.eg"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          leading={<Mail className="h-4 w-4" />}
          required
        />

        <div className="relative">
          <Input
            label="كلمة المرور"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            dir="ltr"
            placeholder="••••••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            leading={<KeyRound className="h-4 w-4" />}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute end-3 top-[34px] rounded p-1 text-ink-400 hover:text-ink-700"
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={mutation.isPending}>
          دخول إلى المنصة
        </Button>

        <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-3">
          <p className="text-[11px] font-bold text-ink-600">حسابات العرض التجريبي — كلمة المرور: ChangeMe!2026</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword('ChangeMe!2026');
                }}
                className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition hover:border-brand-400 hover:text-brand-800"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </AuthLayout>
  );
}
