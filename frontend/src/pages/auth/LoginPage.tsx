import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage } from '../../lib/api';
import { HOME_BY_ROLE } from '../../lib/constants';
import { Alert } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { TypewriterText } from '../../components/ui/TypewriterText';
import { useFirstVisitTyping } from '../../components/ui/useFirstVisitTyping';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const firstVisit = useFirstVisitTyping();
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
      title={t('تسجيل الدخول')}
      subtitle={t('استخدم البريد الجامعي وكلمة المرور للوصول إلى لوحة الإرشاد الأكاديمي.')}
      footer={
        <span>
          <TypewriterText text={t('لا تملك حسابًا؟ تُنشأ الحسابات من قِبل إدارة الكلية.')} speed={18} active={firstVisit} />{' '}
          <Link to="/forgot-password" className="font-bold text-brand-700 hover:text-brand-900">
            <TypewriterText text={t('نسيت كلمة المرور؟')} speed={24} active={firstVisit} />
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}

        <Input
          label={<TypewriterText text={t('البريد الإلكتروني')} speed={28} active={firstVisit} />}
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
            label={<TypewriterText text={t('كلمة المرور')} speed={28} active={firstVisit} />}
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
            aria-label={showPassword ? t('إخفاء كلمة المرور') : t('إظهار كلمة المرور')}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={mutation.isPending}>
          <TypewriterText text={t('دخول إلى المنصة')} speed={30} active={firstVisit && !mutation.isPending} />
        </Button>
      </form>
    </AuthLayout>
  );
}
