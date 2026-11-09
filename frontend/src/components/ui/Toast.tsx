import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';
import { cn } from '../../lib/format';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  toast: (input: { tone?: ToastTone; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  error: <XCircle className="h-5 w-5 text-danger" />,
  info: <Info className="h-5 w-5 text-sky-600" />,
  warning: <TriangleAlert className="h-5 w-5 text-amber-600" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    ({ tone = 'info', title, description }) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => remove(id), 6000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:end-5 sm:w-96">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-white p-4 shadow-float',
              item.tone === 'error' && 'border-red-200',
              item.tone === 'success' && 'border-emerald-200',
              item.tone === 'warning' && 'border-amber-200',
              item.tone === 'info' && 'border-sky-200',
            )}
          >
            <div className="mt-0.5 shrink-0">{ICONS[item.tone]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900">{item.title}</p>
              {item.description && <p className="mt-0.5 text-xs leading-5 text-ink-600">{item.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded p-1 text-ink-400 hover:bg-ink-100"
              aria-label="إخفاء التنبيه"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook is the public API of this provider module
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
