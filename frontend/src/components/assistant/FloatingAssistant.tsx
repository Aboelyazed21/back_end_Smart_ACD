import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Send, ShieldAlert, X } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { Alert, ErrorState, LoadingBlock, Spinner } from '../ui/Feedback';
import { Button } from '../ui/Button';
import { MessageBubble } from '../chat/MessageBubble';
import { CHAT_SUGGESTIONS } from '../chat/suggestions';
import { useChat } from '../chat/useChat';

/**
 * BUA-blue waving robot mark used by the global floating assistant.
 * The arm is a separate group so `.aidm-wave` can rotate it around the
 * shoulder point (see the keyframes in index.css).
 */
function RobotMark({ className, gradientId = 'aidm-robot' }: { className?: string; gradientId?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#bfdbfe" />
          <stop offset="45%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      {/* antenna */}
      <path d="M32 14V8" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="6" r="3" fill="#eff6ff" />
      {/* ears */}
      <rect x="7" y="24" width="6" height="12" rx="3" fill="#1e40af" />
      <rect x="51" y="24" width="6" height="12" rx="3" fill="#1e40af" />
      {/* head */}
      <rect x="12" y="14" width="40" height="34" rx="14" fill={`url(#${gradientId})`} />
      {/* face */}
      <rect x="18" y="21" width="28" height="18" rx="9" fill="#0b2545" />
      {/* eyes */}
      <circle cx="26" cy="29.5" r="3.4" fill="#eff6ff" />
      <circle cx="38" cy="29.5" r="3.4" fill="#eff6ff" />
      {/* smile */}
      <path d="M28 34.5c1.5 2 6.5 2 8 0" fill="none" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
      {/* waving arm — rotated by .aidm-wave around the shoulder (48,42) */}
      <g className="aidm-wave">
        <path
          d="M48 42C53 41 56 37 56 31"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <circle cx="56" cy="28" r="4.2" fill="#93c5fd" />
      </g>
    </svg>
  );
}

/**
 * Global floating AI assistant mounted by AppLayout on every authenticated
 * page. Shares the `useChat` state machine (and the react-query cache) with
 * the full Chat page, so both views stay in sync.
 */
export function FloatingAssistant() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const chat = useChat({ enabled: open });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the composer whenever the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes the panel and returns focus to the launcher button.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Click outside the panel/launcher dismisses it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Keep the newest message in view without scrolling the page behind.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [chat.messages.length, chat.ask.isPending]);

  const newChat = () => {
    chat.setLastResult(null);
    chat.createSession.mutate();
  };

  return (
    <div ref={containerRef} className="fixed bottom-5 end-5 z-[25] flex flex-col items-end gap-3">
      {open && (
        <section
          id="aidm-assistant-panel"
          role="dialog"
          aria-label={t('مساعد اللائحة')}
          className="aidm-pop flex h-[min(36rem,calc(100vh-8.5rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-surface shadow-float"
        >
          {/* Header */}
          <header className="flex items-center gap-2.5 bg-gradient-to-r from-[#0a2545] via-[#123a63] to-[#0d2f52] px-4 py-3 text-white">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <RobotMark className="h-7 w-7" gradientId="aidm-robot-header" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{t('مساعد اللائحة')}</p>
              <p className="truncate text-[11px] text-[#a8c6e8]/80">
                {t('مستخرج من BUA-AIDM.pdf · لا يخترع إجابات')}
              </p>
            </div>
            <button
              type="button"
              onClick={newChat}
              disabled={chat.createSession.isPending}
              aria-label={t('محادثة جديدة')}
              title={t('محادثة جديدة')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#dbe9f9] transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('إغلاق المساعد')}
              title={t('إغلاق المساعد')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#dbe9f9] transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {/* Messages */}
          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {chat.session.isLoading ? (
              <LoadingBlock />
            ) : chat.session.isError ? (
              <ErrorState
                message={errorMessage(chat.session.error)}
                onRetry={() => void chat.session.refetch()}
                className="border-0 bg-transparent px-2 py-8"
              />
            ) : chat.messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <RobotMark className="h-10 w-10" gradientId="aidm-robot-greeting" />
                </span>
                <h3 className="mt-3 font-display text-base font-bold text-ink-900">
                  {t('كيف أساعدك في اللائحة؟')}
                </h3>
                <p className="mt-1 text-xs leading-5 text-ink-500">
                  {t('اسأل عن المواد والشروط والحدود. سأجيب من النص الرسمي فقط، وأحوّل السؤال لمرشد عند ضعف الثقة.')}
                </p>
                <div className="mt-4 grid w-full gap-1.5">
                  {CHAT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => chat.submit(suggestion)}
                      className="rounded-xl border border-ink-200 bg-surface px-3 py-2 text-start text-xs leading-5 text-ink-700 transition hover:border-brand-400 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      {t(suggestion)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}

            {chat.ask.isPending && (
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <Spinner className="h-4 w-4" /> {t('جارٍ البحث في نصوص اللائحة…')}
              </div>
            )}
            {chat.ask.isError && (
              <Alert tone="danger" title={t('تعذر إرسال السؤال')}>
                {errorMessage(chat.ask.error)}
              </Alert>
            )}
            {chat.lastResult?.escalation && (
              <Alert tone="warning" title={t('تم إنشاء حالة مراجعة')} icon={<ShieldAlert className="h-5 w-5" />}>
                {t('رقم التذكرة:')}{' '}
                <span className="font-mono font-bold">{chat.lastResult.escalation.ticketNo}</span> —{' '}
                {t('سيراجعها مرشدك الأكاديمي.')}
              </Alert>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-ink-100 bg-surface p-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                chat.submit();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={chat.question}
                onChange={(event) => chat.setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    chat.submit();
                  }
                }}
                rows={1}
                maxLength={1500}
                placeholder={t('اكتب سؤالك عن اللائحة…')}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
              <Button
                type="submit"
                size="sm"
                loading={chat.ask.isPending}
                disabled={chat.question.trim().length < 2}
                icon={<Send className="h-4 w-4" />}
                aria-label={t('إرسال')}
              >
                {t('إرسال')}
              </Button>
            </form>
            <p className="mt-1.5 text-center text-[10px] leading-4 text-ink-400">
              {t('لا تُدخل بيانات شخصية حساسة. الإجابات استشارية وتُراجع بشريًا عند الحاجة.')}
            </p>
          </div>
        </section>
      )}

      {/* Launcher */}
      <div className="relative">
        {!open && (
          <span className="aidm-pop absolute bottom-full end-0 mb-2 whitespace-nowrap rounded-full border border-ink-200 bg-surface px-3 py-1 text-[11px] font-black text-brand-700 shadow-float">
            {t('مرحبا!')}
          </span>
        )}
        <span
          aria-hidden
          className="aidm-ring pointer-events-none absolute inset-0 rounded-full border-2 border-brand-400/70"
        />
        <span
          aria-hidden
          className="aidm-ring pointer-events-none absolute inset-0 rounded-full border-2 border-brand-400/50"
          style={{ animationDelay: '1.3s' }}
        />
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="aidm-assistant-panel"
          aria-label={open ? t('إغلاق المساعد') : t('فتح المساعد الذكي')}
          title={open ? t('إغلاق المساعد') : t('فتح المساعد الذكي')}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30 ring-1 ring-white/40 transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/40 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:transition-none"
        >
          <RobotMark className="h-9 w-9 drop-shadow-sm" />
        </button>
      </div>
    </div>
  );
}
