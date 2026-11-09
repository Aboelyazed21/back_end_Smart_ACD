import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { HOME_BY_ROLE } from '../lib/constants';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  const { user } = useAuth();
  const home = user ? HOME_BY_ROLE[user.role] : '/login';

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Compass className="h-7 w-7" />
        </span>
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700">404</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink-950">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm leading-7 text-ink-500">
          الرابط الذي فتحته غير صحيح أو تم نقل الصفحة. استخدم القائمة للوصول إلى وجهتك.
        </p>
        <Link to={home} className="mt-5 inline-block">
          <Button>العودة إلى الصفحة الرئيسية</Button>
        </Link>
      </div>
    </div>
  );
}
