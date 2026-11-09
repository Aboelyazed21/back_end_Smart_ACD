import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, GraduationCap, ShieldCheck, Sparkles } from 'lucide-react';

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
  return (
    <div className="grid min-h-screen bg-ink-50 lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-ink-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="absolute -start-24 top-1/3 h-80 w-80 rounded-full bg-gold-400/10 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400 font-display text-lg font-black text-ink-950">
              بدر
            </div>
            <div>
              <p className="font-display text-base font-extrabold">جامعة بدر بأسيوط</p>
              <p className="text-xs text-brand-100/80">كلية تكنولوجيا المعلومات وعلوم البيانات</p>
            </div>
          </div>

          <h1 className="mt-14 max-w-xl font-display text-4xl font-black leading-[1.25] text-balance">
            قرارات أكاديمية واضحة،
            <span className="text-gold-300"> لكل طالب وفي كل فصل.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-brand-100/85">
            المرشد الأكاديمي الذكي يقرأ لائحة الكلية، يتحقق من المتطلبات، ويشرح كل قرار بالمادة والصفحة —
            دون أن يسجّل أي مقرر نيابة عن الطالب.
          </p>

          <div className="mt-10 grid max-w-lg gap-3">
            {[
              {
                icon: <ShieldCheck className="h-5 w-5 text-gold-300" />,
                title: 'كل قرار قابل للتتبع',
                text: 'ELIGIBLE / NOT_ELIGIBLE / UNKNOWN / REVIEW_REQUIRED مع رقم القاعدة والمادة والصفحة.',
              },
              {
                icon: <BookOpenCheck className="h-5 w-5 text-gold-300" />,
                title: 'إجابات من اللائحة فقط',
                text: 'المساعد يستشهد بالنص الرسمي، ويحوّل الأسئلة الغامضة إلى مرشد بشري.',
              },
              {
                icon: <GraduationCap className="h-5 w-5 text-gold-300" />,
                title: 'خطط استشارية (DRAFT)',
                text: 'تخطيط ذكي للفصل القادم مع مراعاة المتطلبات والعبء الأكاديمي والحد الأقصى.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
              >
                <div className="mt-0.5 shrink-0">{item.icon}</div>
                <div>
                  <p className="text-sm font-bold text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-brand-100/75">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative mt-10 text-[11px] leading-5 text-brand-100/50">
          AIDM · Badr University in Assiut · منصة استشارية لا تُنشئ تسجيلًا رسميًا.
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-900 font-display text-base font-black text-gold-300">
              بدر
            </div>
            <div>
              <p className="font-display text-sm font-extrabold text-ink-950">المرشد الأكاديمي الذكي</p>
              <p className="text-[11px] text-ink-500">جامعة بدر بأسيوط</p>
            </div>
          </div>

          <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800">
                <Sparkles className="h-3.5 w-3.5" /> منصة الإرشاد الأكاديمي
              </div>
              <h2 className="font-display text-2xl font-extrabold text-ink-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-500">{subtitle}</p>
            </div>
            {children}
          </div>

          {footer && <div className="mt-5 text-center text-sm text-ink-500">{footer}</div>}
          <p className="mt-6 text-center text-[11px] leading-5 text-ink-400">
            <Link to="/login" className="hover:text-ink-600">
              الوصول محمي · الجلسات تُدوّر تلقائيًا · كل العمليات الحساسة تُسجّل في سجل التدقيق
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
