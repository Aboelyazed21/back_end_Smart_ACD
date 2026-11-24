import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Bot, MessagesSquare, Send, ShieldAlert } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { formatDate, cn } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock, Spinner } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/Page';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { CHAT_SUGGESTIONS } from '../../components/chat/suggestions';
import { useChat } from '../../components/chat/useChat';

export function ChatPage() {
  const { t } = useTranslation();
  const {
    sessions,
    session,
    activeId,
    setActiveId,
    question,
    setQuestion,
    language,
    setLanguage,
    lastResult,
    setLastResult,
    createSession,
    ask,
    submit,
    activeSession,
    messages,
  } = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, ask.isPending]);

  return (
    <div>
      <PageHeader
        eyebrow={t('مساعد اللائحة')}
        title={t('اسأل عن لائحة الكلية')}
        description={t(
          'إجابات مستخرجة حصريًا من نصوص اللائحة المخزنة، مع استشهاد بالمادة والصفحة ومستوى ثقة. الأسئلة الرقمية تُحال لمحرك القواعد.',
        )}
        actions={
          <Button
            onClick={() => createSession.mutate()}
            loading={createSession.isPending}
            icon={<MessageSquarePlus className="h-4 w-4" />}
          >
            {t('محادثة جديدة')}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit lg:sticky lg:top-20">
          <div className="border-b border-ink-50 px-4 py-3">
            <p className="text-sm font-bold text-ink-900">{t('المحادثات')}</p>
            <p className="text-xs text-ink-500">
              {t('{{n}} محادثة', { n: sessions.data?.data.length ?? 0 })}
            </p>
          </div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
            {sessions.isLoading && <LoadingBlock label="" className="py-6" />}
            {sessions.data?.data.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-ink-500">{t('لا توجد محادثات.')}</p>
            )}
            {sessions.data?.data.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveId(item.id);
                  setLastResult(null);
                }}
                className={cn(
                  'w-full rounded-lg px-3 py-2 text-start transition',
                  item.id === activeId ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-ink-50',
                )}
              >
                <p className="truncate text-xs font-bold">{item.title}</p>
                <p className="mt-0.5 text-[10px] text-ink-500">
                  {formatDate(item.updated_at, true)} ·{' '}
                  {t('{{n}} رسالة', { n: item.message_count ?? 0 })}
                </p>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex min-h-[70vh] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-50 bg-ink-50/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900">{activeSession?.title ?? t('مساعد اللائحة')}</p>
                <p className="text-[11px] text-ink-500">{t('مستخرج من BUA-AIDM.pdf · لا يخترع إجابات')}</p>
              </div>
            </div>
            <Select
              aria-label={t('لغة الإجابة')}
              className="h-8 w-28 text-xs"
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              options={[
                { value: 'auto', label: t('تلقائي') },
                { value: 'ar', label: t('عربي') },
                { value: 'en', label: t('English') },
              ]}
            />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {!activeId || (session.data?.data.messages.length ?? 0) === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <Bot className="h-7 w-7" />
                </div>
                <h3 className="mt-3 font-display text-lg font-bold text-ink-900">{t('كيف أساعدك في اللائحة؟')}</h3>
                <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">
                  {t(
                    'اسأل عن المواد والشروط والحدود. سأجيب من النص الرسمي فقط، وأحوّل السؤال لمرشد عند ضعف الثقة.',
                  )}
                </p>
                <div className="mt-4 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {CHAT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => submit(suggestion)}
                      className="rounded-xl border border-ink-200 bg-surface px-3 py-2 text-start text-xs leading-5 text-ink-700 transition hover:border-brand-400 hover:bg-brand-50/40"
                    >
                      {t(suggestion)}
                    </button>
                  ))}
                </div>
              </div>
            ) : session.isLoading ? (
              <LoadingBlock />
            ) : session.isError ? (
              <ErrorState message={errorMessage(session.error)} onRetry={() => void session.refetch()} />
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
            {ask.isPending && (
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <Spinner className="h-4 w-4" /> {t('جارٍ البحث في نصوص اللائحة…')}
              </div>
            )}
            {lastResult?.escalation && (
              <Alert tone="warning" title={t('تم إنشاء حالة مراجعة')} icon={<ShieldAlert className="h-5 w-5" />}>
                {t('رقم التذكرة:')} <span className="font-mono font-bold">{lastResult.escalation.ticketNo}</span> —{' '}
                {t('سيراجعها مرشدك الأكاديمي.')}
              </Alert>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-ink-100 bg-surface p-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                maxLength={1500}
                placeholder={t('اكتب سؤالك عن اللائحة…')}
                className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-ink-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
              <Button
                type="submit"
                loading={ask.isPending}
                disabled={question.trim().length < 2}
                icon={<Send className="h-4 w-4" />}
              >
                {t('إرسال')}
              </Button>
            </form>
            <p className="mt-1.5 text-center text-[10px] text-ink-400">
              {t('لا تُدخل بيانات شخصية حساسة. الإجابات استشارية وتُراجع بشريًا عند الحاجة.')}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function ChatEmptyIcon() {
  return <MessagesSquare className="h-6 w-6" />;
}
