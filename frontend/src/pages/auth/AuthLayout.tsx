import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpenCheck, GraduationCap, Moon, ShieldCheck, Sun } from 'lucide-react';
import { BuaLogo } from '../../components/brand/BuaLogo';
import { useTheme } from '../../theme/ThemeProvider';
import buaCampus from '../../assets/bua-campus.jpg';
import { TypewriterText } from '../../components/ui/TypewriterText';
import { useFirstVisitTyping } from '../../components/ui/useFirstVisitTyping';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'كل قرار قابل للتتبع',
    text: 'ELIGIBLE / NOT_ELIGIBLE / UNKNOWN / REVIEW_REQUIRED مع رقم القاعدة والمادة والصفحة.',
  },
  {
    icon: BookOpenCheck,
    title: 'إجابات من اللائحة فقط',
    text: 'المساعد يستشهد بالنص الرسمي، ويحوّل الأسئلة الغامضة إلى مرشد بشري.',
  },
  {
    icon: GraduationCap,
    title: 'خطط استشارية (DRAFT)',
    text: 'تخطيط ذكي للفصل القادم مع مراعاة المتطلبات والعبء الأكاديمي والحد الأقصى.',
  },
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const firstVisit = useFirstVisitTyping();
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = 'transparent';
    return () => {
      document.body.style.background = prev;
    };
  }, []);
  return (
    <div className="grid min-h-screen bg-transparent capitalize [&_input]:normal-case [&_textarea]:normal-case [&_[dir='ltr']]:normal-case lg:grid-cols-[1.08fr_1fr]">
      <section className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between">
        <img
          src={buaCampus}
          alt={t('حرم جامعة بدر بأسيوط')}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/60 to-black/90"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(229,174,50,0.18),transparent_52%)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black to-transparent"
          aria-hidden
        />

        <div className="relative p-10 xl:p-12">
          <div className="inline-flex items-center rounded-2xl bg-white/95 px-4 py-3 shadow-float ring-1 ring-white/60 backdrop-blur-sm">
            <BuaLogo globeClassName="h-12 w-12" wordmarkClassName="h-[44px] w-auto" />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
            {t('كلية تكنولوجيا المعلومات وعلوم البيانات')}
          </p>

          <h1 className="mt-12 max-w-xl font-display text-4xl font-black leading-[1.28] text-balance drop-shadow-sm xl:text-[2.75rem]">
            {t('قرارات أكاديمية واضحة،')}
            <span className="text-gold-300">{t(' لكل طالب وفي كل فصل.')}</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-white/85">
            {t(
              'المرشد الأكاديمي الذكي يقرأ لائحة الكلية، يتحقق من المتطلبات، ويشرح كل قرار بالمادة والصفحة — دون أن يسجّل أي مقرر نيابة عن الطالب.',
            )}
          </p>

          <div className="mt-9 grid max-w-lg gap-3">
            {FEATURES.map(({ icon: Icon, title: featureTitle, text }) => (
              <div
                key={featureTitle}
                className="flex gap-3 rounded-2xl border border-gold-300/45 bg-black/25 p-4 shadow-[0_0_24px_rgba(229,174,50,0.08)] backdrop-blur-xl"
              >
                <div className="mt-0.5 shrink-0">
                  <Icon className="h-5 w-5 text-gold-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{t(featureTitle)}</p>
                  <p className="mt-0.5 text-xs leading-5 text-white/75">{t(text)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative px-10 pb-8 text-[11px] leading-5 text-white/55 xl:px-12">
          {t('AIDM · Badr University in Assiut · منصة استشارية لا تُنشئ تسجيلًا رسميًا.')}
        </p>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden bg-transparent px-4 py-10 sm:px-8">
        <div className="absolute inset-0 lg:hidden" aria-hidden>
          <img src={buaCampus} alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-black/65" />
        </div>
        <div
          role="group"
          aria-label={t('مظهر الواجهة')}
          className="segmented absolute end-4 top-4 z-10 inline-flex h-9 items-center rounded-xl border border-ink-200/80 bg-ink-50/70 p-[var(--seg-pad)] shadow-inner backdrop-blur"
        >
          <span
            aria-hidden
            data-index={resolvedTheme === 'light' ? 0 : 1}
            className="segmented-indicator pointer-events-none absolute bottom-1 top-1 rounded-lg bg-gradient-to-b from-primary to-brand-600 shadow-sm ring-1 ring-black/5"
          />
          {(
            [
              { key: 'light', icon: Sun, title: t('الوضع الفاتح') },
              { key: 'dark', icon: Moon, title: t('الوضع الداكن') },
            ] as const
          ).map((option) => {
            const active = resolvedTheme === option.key;
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setTheme(option.key)}
                aria-pressed={active}
                aria-label={option.title}
                title={option.title}
                className={[
                  'segmented-item relative z-10 inline-flex h-7 items-center justify-center rounded-lg transition-colors',
                  active ? 'text-on-primary' : 'text-ink-500 hover:text-ink-900',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="relative z-10 w-full max-w-md">
          <div className="mb-7 flex flex-col items-start gap-2 lg:hidden">
            <BuaLogo variant={resolvedTheme === 'dark' ? 'white' : 'navy'} globeClassName="h-11 w-11" wordmarkClassName="h-[40px] w-auto" />
            <p className="text-[11px] font-semibold text-ink-500">
              <TypewriterText text={t('المرشد الأكاديمي الذكي · جامعة بدر بأسيوط')} speed={18} active={firstVisit} />
            </p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-gold-500/60 bg-surface/5 shadow-float ring-1 ring-gold-400/25 backdrop-blur-xl dark:bg-surface/10">
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="bg-gradient-to-l from-brand-800 to-ink-950 bg-clip-text font-display text-2xl font-extrabold text-transparent dark:from-brand-300 dark:to-ink-950">
                  <TypewriterText text={title} active={firstVisit} />
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-500"><TypewriterText text={subtitle} speed={14} active={firstVisit} /></p>
              </div>
              {children}
            </div>
          </div>

          {footer && <div className="mt-5 text-center text-sm text-ink-500">{footer}</div>}
          <p className="mt-6 text-center text-[11px] leading-5 text-ink-400">
            <Link to="/login" className="hover:text-ink-600">
              <TypewriterText text={t('الوصول محمي · الجلسات تُدوّر تلقائيًا · كل العمليات الحساسة تُسجّل في سجل التدقيق')} speed={12} active={firstVisit} />
            </Link>
          </p>
          <p className="mt-3 text-center text-[11px] leading-5 text-ink-400">
            <TypewriterText text={`© ${new Date().getFullYear()} Aboelyazed Hatem Aboelyazed · ${t('جميع الحقوق محفوظة')}`} speed={16} active={firstVisit} />
          </p>
        </div>
      </section>
    </div>
  );
}
