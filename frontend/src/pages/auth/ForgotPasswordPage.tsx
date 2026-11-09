import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Alert } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } }),
  });

  return (
    <AuthLayout
      title="استعادة كلمة المرور"
      subtitle="أدخل بريدك الجامعي وسنرسل رابطًا لإعادة التعيين إن كان الحساب موجودًا."
      footer={
        <Link to="/login" className="font-bold text-brand-700 hover:text-brand-900">
          رجوع إلى تسجيل الدخول
        </Link>
      }
    >
      {mutation.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="success" title="تم إرسال الطلب">
            {mutation.data.message} تحقق من بريدك الجامعي. الرابط صالح لفترة محدودة ولا يمكن استخدامه أكثر من مرة.
          </Alert>
          <Button variant="outline" className="w-full" onClick={() => mutation.reset()}>
            إرسال إلى بريد آخر
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
          noValidate
        >
          {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}
          <Input
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            required
            autoComplete="email"
            placeholder="name@aidm.bua.edu.eg"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            leading={<Mail className="h-4 w-4" />}
          />
          <Button type="submit" className="w-full" size="lg" loading={mutation.isPending}>
            إرسال رابط الاستعادة
          </Button>
          <p className="text-xs leading-5 text-ink-500">
            لأسباب أمنية لا نُفصح عمّا إذا كان البريد مسجلًا أم لا. لن يظهر أي اختلاف في الاستجابة.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
