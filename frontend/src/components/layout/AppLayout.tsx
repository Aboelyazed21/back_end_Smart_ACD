import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
  GraduationCap,
  Gauge,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessagesSquare,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  Shuffle,
  TriangleAlert,
  Upload,
  UserCog,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { api, qs } from '../../lib/api';
import { NAV_GROUPS, ROLE_LABELS } from '../../lib/constants';
import { cn, initials } from '../../lib/format';
import type { NotificationRow, Paginated } from '../../lib/types';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/Button';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ShieldCheck,
  ListChecks,
  Gauge,
  TriangleAlert,
  GraduationCap,
  Shuffle,
  BookOpen,
  UserRound,
  MessagesSquare,
  Bell,
  Users,
  ClipboardCheck,
  CalendarClock,
  Inbox,
  UserCog,
  Building2,
  Scale,
  ScrollText,
  ChartColumn,
  Upload,
};

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-400 font-display text-lg font-black text-ink-950 shadow-sm">
        بدر
      </div>
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-extrabold text-white">المرشد الأكاديمي الذكي</p>
        <p className="truncate text-[11px] text-brand-100/80">جامعة بدر بأسيوط · AIDM</p>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, me, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = user ? NAV_GROUPS[user.role] : [];

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      api<Paginated<NotificationRow>>(
        `/student/notifications${qs({ unread: 'true', page: 1, limit: 1 })}`,
      ),
    enabled: user?.role === 'student',
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const unread = notifications?.pagination.total ?? 0;

  const roleLabel = user ? ROLE_LABELS[user.role] : '';
  const subtitle = useMemo(() => {
    if (user?.role === 'student' && me?.student) return `${me.student.student_code} · ${me.student.program}`;
    if (user?.role === 'advisor' && me?.advisor) return `مرشد · ${me.advisor.max_students} طالب كحد أقصى`;
    return user?.email ?? '';
  }, [user, me]);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-ink-50">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-950/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 end-0 z-40 flex w-72 flex-col bg-gradient-to-b from-brand-950 via-brand-900 to-ink-950 transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-5">
          <Logo />
          <IconButton label="إغلاق القائمة" className="text-brand-100 hover:bg-white/10 lg:hidden" onClick={closeMobile}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="mx-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-200/70">الحساب الحالي</p>
          <p className="mt-1 truncate text-sm font-bold text-white">{user?.fullName}</p>
          <p className="truncate text-[11px] text-brand-100/70">{subtitle}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-bold text-gold-200">
              {roleLabel}
            </span>
            {user?.isDemo && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">تجريبي</span>
            )}
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4" aria-label="القائمة الرئيسية">
          {navItems.map((item) => {
            const Icon = ICONS[item.icon] ?? LayoutDashboard;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to.split('/').length === 2}
                onClick={closeMobile}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-white/12 text-white shadow-inner ring-1 ring-white/10'
                      : 'text-brand-100/75 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-gold-300' : 'text-brand-200/70')} />
                    <span className="flex-1">{item.label}</span>
                    {item.to === '/student/notifications' && unread > 0 && (
                      <span className="rounded-full bg-gold-400 px-1.5 py-0.5 text-[10px] font-black text-ink-950">
                        {unread}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <NavLink
            to="/settings"
            onClick={closeMobile}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-brand-100/75 transition hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-[18px] w-[18px] text-brand-200/70" />
            إعدادات الحساب
          </NavLink>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-brand-100/75 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px] text-brand-200/70" />
            تسجيل الخروج
          </button>
          <p className="mt-2 px-3 text-[10px] leading-5 text-brand-200/50">
            نظام استشاري فقط — لا يتم تسجيل أي مقررات تلقائيًا.
          </p>
        </div>
      </aside>

      <div className="lg:me-72">
        <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <IconButton label="فتح القائمة" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </IconButton>

            <div className="hidden items-center gap-2 sm:flex">
              <Badge tone="brand" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> قرارات مرتبطة باللائحة
              </Badge>
              <span className="text-xs text-ink-500">كل قرار يحمل مادة وصفحة ورقم قاعدة</span>
            </div>

            <div className="flex flex-1 items-center justify-end gap-1.5">
              {user?.role === 'student' && (
                <NavLink
                  to="/student/notifications"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
                  aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ''}`}
                >
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </NavLink>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-2 py-1.5 text-start transition hover:border-brand-300"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">
                    {initials(user?.fullName)}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-[10rem] truncate text-xs font-bold text-ink-900">
                      {user?.fullName}
                    </span>
                    <span className="block text-[10px] text-ink-500">{roleLabel}</span>
                  </span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                    <div className="absolute end-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-float">
                      <div className="border-b border-ink-50 px-4 py-3">
                        <p className="truncate text-sm font-bold text-ink-900">{user?.fullName}</p>
                        <p className="truncate text-xs text-ink-500">{user?.email}</p>
                      </div>
                      <NavLink
                        to="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
                      >
                        <Settings className="h-4 w-4" /> إعدادات الحساب
                      </NavLink>
                      <button
                        type="button"
                        onClick={onLogout}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" /> تسجيل الخروج
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {user?.mustChangePassword && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 sm:px-6">
              يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام النظام.{' '}
              <NavLink to="/settings" className="font-bold underline">
                تغيير كلمة المرور الآن
              </NavLink>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>

        <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-[11px] leading-5 text-ink-400 sm:px-6">
          كل الخطط والمخرجات استشارية (DRAFT) ولا تُعد تسجيلًا رسميًا. القرار النهائي للجنة الأكاديمية بالكلية.
          <br />
          Smart Academic Advisor · Badr University in Assiut · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
