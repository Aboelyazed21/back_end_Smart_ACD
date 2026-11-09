import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { HOME_BY_ROLE } from '../lib/constants';
import { Button } from '../components/ui/Button';

export function ForbiddenPage() {
  const { user } = useAuth();
  const home = user ? HOME_BY_ROLE[user.role] : '/login';

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-danger">
          <ShieldX className="h-7 w-7" />
        </span>
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-danger">403</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink-950">لا تملك صلاحية الوصول</h1>
        <p className="mt-2 text-sm leading-7 text-ink-500">
          هذه الصفحة متاحة لدور آخر. إن كنت تعتقد أن هذا خطأ، تواصل مع مسؤول النظام.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to={home}>
            <Button>العودة إلى لوحتي</Button>
          </Link>
          <Link to="/login">
            <Button variant="outline">تسجيل الدخول</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
