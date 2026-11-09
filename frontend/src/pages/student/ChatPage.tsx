import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookMarked,
  Bot,
  ExternalLink,
  MessageSquarePlus,
  MessagesSquare,
  Send,
  ShieldAlert,
  Sparkles,
  User,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { ChatAskResult, ChatMessage, ChatSession } from '../../lib/types';
import { formatDate, formatNumber, cn } from '../../lib/format';
import { Alert, ErrorState, LoadingBlock, Spinner } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import { PageHeader, ProgressBar } from '../../components/ui/Page';
import { useToast } from '../../components/ui/Toast';

const SUGGESTIONS = [
  'ما هو الحد الأقصى للساعات المعتمدة في الفصل؟',
  'ما شروط مرتبة الشرف؟',
  'ماذا يحدث عند الإنذار الأكاديمي الثالث المتتالي؟',
  'ما متطلبات التدريب الميداني ومشروع التخرج؟',
];

export function ChatPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<'auto' | 'ar' | 'en'>('auto');
  const [lastResult, setLastResult] = useState<ChatAskResult | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const sessions = useQuery({
    queryKey: ['chat', 'sessions'],
    queryFn: () => api<{ data: ChatSession[] }>('/chat/sessions'),
  });

  useEffect(() => {
    if (!activeId && sessions.data?.data.length) setActiveId(sessions.data.data[0]!.id);
  }, [sessions.data, activeId]);

  const session = useQuery({
    queryKey: ['chat', 'session', activeId],
    queryFn: () => api<{ data: { session: ChatSession; messages: ChatMessage[] } }>(`/chat/sessions/${activeId}`),
    enabled: Boolean(activeId),
  });

  const createSession = useMutation({
    mutationFn: () => api<{ data: ChatSession }>('/chat/sessions', { method: 'POST', body: { title: 'استشارة لائحة' } }),
    onSuccess: async (data) => {
      setActiveId(data.data.id);
      setLastResult(null);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] });
    },
    onError: (error) => toast.error('تعذر بدء المحادثة', errorMessage(error)),
  });

  const ask = useMutation({
    mutationFn: (text: string) =>
      api<{ data: ChatAskResult }>(`/chat/sessions/${activeId}/messages`, {
        method: 'POST',
        body: { question: text, language },
      }),
    onSuccess: async (data) => {
      setQuestion('');
      setLastResult(data.data);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'session', activeId] });
      await queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] });
      if (data.data.escalate) toast.toast({ tone: 'warning', title: 'تم تحويل السؤال لمرشد', description: data.data.escalateReason ?? undefined });
    },
    onError: (error) => toast.error('تعذر إرسال السؤال', errorMessage(error)),
  });

  const activeSession = sessions.data?.data.find((item) => item.id === activeId);
  const messages = session.data?.data.messages ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, ask.isPending]);

  const submit = (text?: string) => {
    const value = (text ?? question).trim();
    if (value.length < 2 || ask.isPending) return;
    if (!activeId) {
      createSession.mutate(undefined, {
        onSuccess: (data) => {
          setActiveId(data.data.id);
          setTimeout(() => {
            void api<{ data: ChatAskResult }>(`/chat/sessions/${data.data.id}/messages`, {
              method: 'POST',
              body: { question: value, language },
            }).then(async (result) => {
              setQuestion('');
              setLastResult(result.data);
              await queryClient.invalidateQueries({ queryKey: ['chat', 'session', data.data.id] });
              await queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] });
            });
          }, 0);
        },
      });
      return;
    }
    ask.mutate(value);
  };

  return (
    <div>
      <PageHeader
        eyebrow="مساعد اللائحة"
        title="اسأل عن لائحة الكلية"
        description="إجابات مستخرجة حصريًا من نصوص اللائحة المخزنة، مع استشهاد بالمادة والصفحة ومستوى ثقة. الأسئلة الرقمية تُحال لمحرك القواعد."
        actions={
          <Button
            onClick={() => createSession.mutate()}
            loading={createSession.isPending}
            icon={<MessageSquarePlus className="h-4 w-4" />}
          >
            محادثة جديدة
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit lg:sticky lg:top-20">
          <div className="border-b border-ink-50 px-4 py-3">
            <p className="text-sm font-bold text-ink-900">المحادثات</p>
            <p className="text-xs text-ink-500">{sessions.data?.data.length ?? 0} محادثة</p>
          </div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
            {sessions.isLoading && <LoadingBlock label="" className="py-6" />}
            {sessions.data?.data.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-ink-500">لا توجد محادثات.</p>
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
                  {formatDate(item.updated_at, true)} · {item.message_count ?? 0} رسالة
                </p>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex min-h-[70vh] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-50 bg-ink-50/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900">{activeSession?.title ?? 'مساعد اللائحة'}</p>
                <p className="text-[11px] text-ink-500">مستخرج من BUA-AIDM.pdf · لا يخترع إجابات</p>
              </div>
            </div>
            <Select
              aria-label="لغة الإجابة"
              className="h-8 w-28 text-xs"
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              options={[
                { value: 'auto', label: 'تلقائي' },
                { value: 'ar', label: 'عربي' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {!activeId || (session.data?.data.messages.length ?? 0) === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h3 className="mt-3 font-display text-lg font-bold text-ink-900">كيف أساعدك في اللائحة؟</h3>
                <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">
                  اسأل عن المواد والشروط والحدود. سأجيب من النص الرسمي فقط، وأحوّل السؤال لمرشد عند ضعف الثقة.
                </p>
                <div className="mt-4 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => submit(suggestion)}
                      className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-start text-xs leading-5 text-ink-700 transition hover:border-brand-400 hover:bg-brand-50/40"
                    >
                      {suggestion}
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
                <Spinner className="h-4 w-4" /> جارٍ البحث في نصوص اللائحة…
              </div>
            )}
            {lastResult?.escalation && (
              <Alert tone="warning" title="تم إنشاء حالة مراجعة" icon={<ShieldAlert className="h-5 w-5" />}>
                رقم التذكرة: <span className="font-mono font-bold">{lastResult.escalation.ticketNo}</span> — سيراجعها
                مرشدك الأكاديمي.
              </Alert>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-ink-100 bg-white p-3">
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
                placeholder="اكتب سؤالك عن اللائحة…"
                className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-ink-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
              <Button type="submit" loading={ask.isPending} disabled={question.trim().length < 2} icon={<Send className="h-4 w-4" />}>
                إرسال
              </Button>
            </form>
            <p className="mt-1.5 text-center text-[10px] text-ink-400">
              لا تُدخل بيانات شخصية حساسة. الإجابات استشارية وتُراجع بشريًا عند الحاجة.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const citations = Array.isArray(message.citations) ? message.citations : [];
  const confidence = message.confidence === null || message.confidence === undefined ? null : Number(message.confidence);

  return (
    <div className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={cn('max-w-[88%] space-y-2', isUser && 'order-first')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-7',
            isUser ? 'bg-brand-700 text-white' : 'border border-ink-100 bg-ink-50/70 text-ink-800',
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {!isUser && (
          <>
            {confidence !== null && (
              <div className="px-1">
                <div className="flex items-center justify-between text-[10px] text-ink-500">
                  <span>درجة الثقة في الاستخراج</span>
                  <span className="tabular-nums">{formatNumber(confidence * 100, 0)}٪</span>
                </div>
                <ProgressBar
                  value={confidence * 100}
                  tone={confidence >= 0.6 ? 'success' : confidence >= 0.4 ? 'gold' : 'danger'}
                />
              </div>
            )}
            {message.escalated && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                <ShieldAlert className="h-3.5 w-3.5" /> تم تحويل هذا السؤال إلى مرشد بشري
              </div>
            )}
            {citations.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1 px-1 text-[10px] font-bold text-ink-500">
                  <BookMarked className="h-3 w-3" /> المصادر من اللائحة
                </p>
                {citations.map((citation, index) => (
                  <div
                    key={`${citation.article}-${citation.page}-${index}`}
                    className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[11px] text-ink-600"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-bold text-ink-800">
                        مادة {citation.article}
                        {citation.clause ? ` · بند ${citation.clause}` : ''}
                      </span>
                      <span className="font-mono text-ink-500">ص {citation.page}</span>
                    </div>
                    {citation.title && <p className="mt-0.5 text-ink-500">{citation.title}</p>}
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-400">
                      <ExternalLink className="h-3 w-3" /> {citation.source ?? 'BUA-AIDM.pdf'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {message.rule_code && (
              <Badge tone="info" className="font-mono text-[10px]">
                {message.rule_code}
              </Badge>
            )}
          </>
        )}
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-200 text-ink-700">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function ChatEmptyIcon() {
  return <MessagesSquare className="h-6 w-6" />;
}
