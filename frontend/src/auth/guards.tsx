import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { HOME_BY_ROLE } from '../lib/constants';
import type { Role } from '../lib/types';
import { LoadingBlock } from '../components/ui/Feedback';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'bootstrapping') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <LoadingBlock label="جارٍ التحقق من الجلسة…" />
      </div>
    );
  }
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/403" replace />;
  return <Outlet />;
}

export function GuestOnly() {
  const { status, user } = useAuth();
  if (status === 'bootstrapping') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <LoadingBlock label="جارٍ التحقق من الجلسة…" />
      </div>
    );
  }
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <Outlet />;
}
