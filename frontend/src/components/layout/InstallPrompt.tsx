import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'aidm-install-dismissed';

export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (standalone) return;
    if (!dismissed) setShow(true);

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBefore);
    return () => window.removeEventListener('beforeinstallprompt', onBefore);
  }, []);

  if (!show) return null;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      setDeferred(null);
      setShow(false);
      localStorage.setItem(DISMISS_KEY, '1');
      return;
    }
  };

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:inset-x-auto sm:bottom-4 sm:end-4 sm:max-w-sm" dir="auto">
      <div className="flex items-start gap-3 rounded-2xl border border-gold-500/40 bg-surface/95 p-4 shadow-float backdrop-blur">
        <div className="mt-0.5 rounded-xl bg-brand-600/15 p-2 text-brand-700">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900">{t('ثبّت التطبيق على جهازك')}</p>
          <p className="mt-1 text-xs leading-5 text-ink-500">
            {isIos && !deferred
              ? t('من Safari اضغط مشاركة ثم "إضافة إلى الشاشة الرئيسية".')
              : t('للوصول السريع وتجربة أفضل، ثبّت Smart Academic Advisor على جهازك.')}
          </p>
          <div className="mt-3 flex gap-2">
            {deferred ? (
              <button type="button" onClick={install} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
                {t('تثبيت')}
              </button>
            ) : null}
            <button type="button" onClick={dismiss} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
              {t('لاحقًا')}
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="rounded p-1 text-ink-400 hover:text-ink-700" aria-label={t('إغلاق')}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
