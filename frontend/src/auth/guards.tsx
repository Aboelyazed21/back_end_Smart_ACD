import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HOME_BY_ROLE } from '../lib/constants';
import type { Role } from '../lib/types';
import { LoadingBlock } from '../components/ui/Feedback';
import { useAuth } from './AuthProvider';

function SessionCheck() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <LoadingBlock label={t('جارٍ التحقق من الجلسة…')} />
    </div>
  );
}

export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'bootstrapping') return <SessionCheck />;
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
  if (status === 'bootstrapping') return <SessionCheck />;
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return <Outlet />;
}
