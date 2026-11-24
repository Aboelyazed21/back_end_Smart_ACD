import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  BadgeCheck,
  Bell,
  BellRing,
  BotMessageSquare,
  Building2,
  CalendarClock,
  Calculator,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Contact,
  FileUp,
  FileWarning,
  GitCompareArrows,
  GraduationCap,
  Inbox,
  Library,
  LogOut,
  Megaphone,
  Menu,
  Monitor,
  Moon,
  PanelsTopLeft,
  Scale,
  ScrollText,
  Settings,
  Siren,
  Sun,
  UserCog,
  UsersRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { useLanguage } from '../../i18n/LanguageProvider';
import { api, qs } from '../../lib/api';
import { NAV_GROUPS, ROLE_LABELS } from '../../lib/constants';
import { cn, initials } from '../../lib/format';
import type { NotificationRow, Paginated } from '../../lib/types';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/Button';
import { BuaLogo } from '../brand/BuaLogo';
import { FloatingAssistant } from '../assistant/FloatingAssistant';

const ICONS: Record<string, LucideIcon> = {
  PanelsTopLeft,
  BadgeCheck,
  ClipboardList,
  Activity,
  Siren,
  GraduationCap,
  Calculator,
  GitCompareArrows,
  Library,
  Contact,
  BotMessageSquare,
  BellRing,
  UsersRound,
  ClipboardCheck,
  CalendarClock,
  Inbox,
  UserCog,
  Building2,
  Scale,
  ScrollText,
  ChartColumn,
  FileUp,
  FileWarning,
  Megaphone,
};

function Logo() {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <BuaLogo
        variant="white"
        globeClassName="h-8 w-8"
        wordmarkClassName="h-[19px] w-auto"
        className="max-w-[190px]"
      />
      <p className="mt-1.5 truncate text-[11px] font-semibold text-[#dbe9f9]/80">
        {t('المرشد الأكاديمي الذكي · AIDM')}
      </p>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, me, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, toggleLang } = useLanguage();
  const { t } = useTranslation();
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

  const roleLabel = user ? t(ROLE_LABELS[user.role]) : '';
  const subtitle = useMemo(() => {
    if (user?.role === 'student' && me?.student) return `${me.student.student_code} · ${me.student.program}`;
    if (user?.role === 'advisor' && me?.advisor)
      return t('مرشد · {{count}} طالب كحد أقصى', { count: me.advisor.max_students });
    return user?.email ?? '';
  }, [user, me, t]);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-canvas">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      <aside
        data-open={mobileOpen}
        className={cn(
          'app-sidebar fixed inset-y-0 start-0 z-40 flex w-72 flex-col bg-gradient-to-b from-[#0a2545] via-[#123a63] to-[#071a2e] lg:shadow-none',
          mobileOpen ? 'shadow-2xl' : '',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-5">
          <Logo />
          <IconButton
            label={t('إغلاق القائمة')}
            className="text-[#dbe9f9] hover:bg-white/10 lg:hidden"
            onClick={closeMobile}
          >
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="mx-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8c6e8]/70">{t('الحساب الحالي')}</p>
          <p className="mt-1 truncate text-sm font-bold text-white">{user?.fullName}</p>
          <p className="truncate text-[11px] text-[#dbe9f9]/70">{subtitle}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-bold text-gold-200">
              {roleLabel}
            </span>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4" aria-label={t('القائمة الرئيسية')}>
          {navItems.map((item) => {
            const Icon = ICONS[item.icon] ?? PanelsTopLeft;
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
                      : 'text-[#dbe9f9]/75 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      strokeWidth={1.75}
                      className={cn(
                        'h-[18px] w-[18px] shrink-0',
                        isActive ? 'text-gold-300' : 'text-[#a8c6e8]/80',
                      )}
                    />
                    <span className="flex-1">{t(item.label)}</span>
                    {item.to === '/student/notifications' && unread > 0 && (
                      <span className="rounded-full bg-gold-400 px-1.5 py-0.5 text-[10px] font-black text-[#111b25]">
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
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#dbe9f9]/75 transition hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-[18px] w-[18px] text-[#a8c6e8]/70" />
            {t('إعدادات الحساب')}
          </NavLink>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#dbe9f9]/75 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px] text-[#a8c6e8]/70" />
            {t('تسجيل الخروج')}
          </button>
          <p className="mt-2 px-3 text-[10px] leading-5 text-[#a8c6e8]/50">
            {t('نظام استشاري فقط — لا يتم تسجيل أي مقررات تلقائيًا.')}
          </p>
        </div>
      </aside>

      <div className="lg:ms-72">
        <header className="sticky top-0 z-20 border-b border-ink-100 bg-surface/90 backdrop-blur dark:border-white/[0.07] dark:bg-surface/80 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <IconButton label={t('فتح القائمة')} className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </IconButton>

            <div className="hidden items-center gap-2 sm:flex">
              <Badge tone="brand">{t('قرارات مرتبطة باللائحة')}</Badge>
              <span className="text-xs text-ink-500">{t('كل قرار يحمل مادة وصفحة ورقم قاعدة')}</span>
            </div>

            <div className="flex flex-1 items-center justify-end gap-1.5">
              {user?.role === 'student' && (
                <NavLink
                  to="/student/notifications"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
                  aria-label={
                    unread
                      ? t('الإشعارات ({{count}} غير مقروء)', { count: unread })
                      : t('الإشعارات')
                  }
                >
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </NavLink>
              )}

              <div
                role="group"
                aria-label={t('تبديل اللغة')}
                className="segmented relative inline-flex h-9 items-center rounded-xl border border-ink-200/80 bg-ink-50/70 p-[var(--seg-pad)] shadow-inner"
              >
                <span
                  aria-hidden
                  data-index={lang === 'en' ? 0 : 1}
                  className="segmented-indicator pointer-events-none absolute bottom-1 top-1 rounded-lg bg-gradient-to-b from-primary to-brand-600 shadow-sm ring-1 ring-black/5"
                />
                {(
                  [
                    { key: 'en', label: 'EN', title: t('English') },
                    { key: 'ar', label: 'ع', title: t('العربية') },
                  ] as const
                ).map((option) => {
                  const active = lang === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => !active && toggleLang()}
                      aria-pressed={active}
                      title={option.title}
                      className={cn(
                        'segmented-item relative z-10 inline-flex h-7 items-center justify-center rounded-lg text-[11px] font-bold tracking-wide transition-colors',
                        active ? 'text-on-primary' : 'text-ink-500 hover:text-ink-900',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div
                role="group"
                aria-label={t('مظهر الواجهة')}
                className="segmented relative inline-flex h-9 items-center rounded-xl border border-ink-200/80 bg-ink-50/70 p-[var(--seg-pad)] shadow-inner"
              >
                <span
                  aria-hidden
                  data-index={['light', 'dark', 'system'].indexOf(theme)}
                  className="segmented-indicator pointer-events-none absolute bottom-1 top-1 rounded-lg bg-gradient-to-b from-primary to-brand-600 shadow-sm ring-1 ring-black/5"
                />
                {(
                  [
                    { key: 'light', icon: Sun, title: t('الوضع الفاتح') },
                    { key: 'dark', icon: Moon, title: t('الوضع الداكن') },
                    { key: 'system', icon: Monitor, title: t('حسب إعداد النظام') },
                  ] as const
                ).map((option) => {
                  const active = theme === option.key;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => !active && setTheme(option.key)}
                      aria-pressed={active}
                      aria-label={option.title}
                      title={option.title}
                      className={cn(
                        'segmented-item relative z-10 inline-flex h-7 items-center justify-center rounded-lg transition-colors',
                        active ? 'text-on-primary' : 'text-ink-500 hover:text-ink-900',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-xl border border-ink-200 bg-surface px-2 py-1.5 text-start transition hover:border-brand-300"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-on-primary">
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
                    <div className="absolute end-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-100 bg-surface shadow-float">
                      <div className="border-b border-ink-50 px-4 py-3">
                        <p className="truncate text-sm font-bold text-ink-900">{user?.fullName}</p>
                        <p className="truncate text-xs text-ink-500">{user?.email}</p>
                      </div>
                      <NavLink
                        to="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
                      >
                        <Settings className="h-4 w-4" /> {t('إعدادات الحساب')}
                      </NavLink>
                      <button
                        type="button"
                        onClick={onLogout}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" /> {t('تسجيل الخروج')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {user?.mustChangePassword && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 sm:px-6">
              {t('يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام النظام.')}{' '}
              <NavLink to="/settings" className="font-bold underline">
                {t('تغيير كلمة المرور الآن')}
              </NavLink>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>

        <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-[11px] leading-5 text-ink-400 sm:px-6">
          {t('كل الخطط والمخرجات استشارية (DRAFT) ولا تُعد تسجيلًا رسميًا. القرار النهائي للجنة الأكاديمية بالكلية.')}
          <br />
          {t('Smart Academic Advisor · Badr University in Assiut · {{year}}', {
            year: new Date().getFullYear(),
          })}
          <br />© {new Date().getFullYear()} Aboelyazed Hatem Aboelyazed · {t('جميع الحقوق محفوظة')}
        </footer>
      </div>

      <FloatingAssistant />
    </div>
  );
}
