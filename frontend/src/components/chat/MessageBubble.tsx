import { useTranslation } from 'react-i18next';
import { BookMarked, Bot, ShieldAlert, User } from 'lucide-react';
import type { ChatMessage } from '../../lib/types';
import { cn, formatNumber } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/Page';

/**
 * Shared chat message bubble (user / assistant) used by the full Chat page and
 * the global floating assistant so both render identically.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const citations = Array.isArray(message.citations) ? message.citations : [];
  const confidence =
    message.confidence === null || message.confidence === undefined ? null : Number(message.confidence);

  return (
    <div className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={cn('max-w-[88%] space-y-2', isUser && 'order-first')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-7',
            isUser ? 'bg-primary text-on-primary' : 'border border-ink-100 bg-ink-50/70 text-ink-800',
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {!isUser && (
          <>
            {confidence !== null && (
              <div className="px-1">
                <div className="flex items-center justify-between text-[10px] text-ink-500">
                  <span>{t('درجة الثقة في الاستخراج')}</span>
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
                <ShieldAlert className="h-3.5 w-3.5" /> {t('تم تحويل هذا السؤال إلى مرشد بشري')}
              </div>
            )}
            {citations.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1 px-1 text-[10px] font-bold text-ink-500">
                  <BookMarked className="h-3 w-3" /> {t('المصادر من اللائحة')}
                </p>
                {citations.map((citation, index) => (
                  <div
                    key={`${citation.article}-${citation.page}-${index}`}
                    className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[11px] text-ink-600"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-bold text-ink-800">
                        {t('مادة {{n}}', { n: citation.article })}
                        {citation.clause ? ` · ${t('بند {{n}}', { n: citation.clause })}` : ''}
                      </span>
                      <span className="font-mono text-ink-500">{t('ص {{n}}', { n: citation.page })}</span>
                    </div>
                    {citation.title && <p className="mt-0.5 text-ink-500">{citation.title}</p>}
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {citation.source ?? 'BUA-AIDM.pdf'}
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
