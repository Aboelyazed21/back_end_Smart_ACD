import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a single broken screen never leaves the app
 * on a blank page. The details are shown only outside production builds.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6" dir="rtl">
        <div className="w-full max-w-lg rounded-2xl border border-ink-200 bg-surface p-6 shadow-sm">
          <h1 className="font-display text-lg font-bold text-ink-900">
            {i18n.t('حدث خطأ غير متوقع في الواجهة')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            {i18n.t('أعد تحميل الصفحة للمتابعة. إذا تكرر الخطأ فأبلغ الدعم الفني مع معرّف الوقت.')}
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-code p-3 text-[11px] leading-5 text-code-fg" dir="ltr">
              {error.message}
            </pre>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {i18n.t('إعادة تحميل الصفحة')}
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              {i18n.t('المحاولة مرة أخرى')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
