import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../lib/api';
import type { ChatAskResult, ChatMessage, ChatSession } from '../../lib/types';
import { useToast } from '../ui/Toast';

export type ChatLanguage = 'auto' | 'ar' | 'en';

/**
 * Shared chat state machine used by the full Chat page and the global
 * floating assistant: session list (auto-selects the most recent), messages
 * of the active session, session creation on first ask, and the ask mutation
 * with escalation toasts. Both consumers share the react-query cache, so a
 * new message in one view is reflected in the other.
 */
export function useChat({ enabled = true }: { enabled?: boolean } = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<ChatLanguage>('auto');
  const [lastResult, setLastResult] = useState<ChatAskResult | null>(null);

  const sessions = useQuery({
    queryKey: ['chat', 'sessions'],
    queryFn: () => api<{ data: ChatSession[] }>('/chat/sessions'),
    enabled,
  });

  useEffect(() => {
    if (enabled && !activeId && sessions.data?.data.length) setActiveId(sessions.data.data[0]!.id);
  }, [enabled, sessions.data, activeId]);

  const session = useQuery({
    queryKey: ['chat', 'session', activeId],
    queryFn: () => api<{ data: { session: ChatSession; messages: ChatMessage[] } }>(`/chat/sessions/${activeId}`),
    enabled: enabled && Boolean(activeId),
  });

  const createSession = useMutation({
    mutationFn: () =>
      api<{ data: ChatSession }>('/chat/sessions', { method: 'POST', body: { title: t('استشارة لائحة') } }),
    onSuccess: async (data) => {
      setActiveId(data.data.id);
      setLastResult(null);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] });
    },
    onError: (error) => toast.error(t('تعذر بدء المحادثة'), errorMessage(error)),
  });

  const ask = useMutation({
    mutationFn: ({ sessionId, text }: { sessionId: string; text: string }) =>
      api<{ data: ChatAskResult }>(`/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: { question: text, language },
      }),
    onSuccess: async (data, variables) => {
      setQuestion('');
      setLastResult(data.data);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'session', variables.sessionId] });
      await queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] });
      if (data.data.escalate)
        toast.toast({
          tone: 'warning',
          title: t('تم تحويل السؤال لمرشد'),
          description: data.data.escalateReason ?? undefined,
        });
    },
    onError: (error) => toast.error(t('تعذر إرسال السؤال'), errorMessage(error)),
  });

  /** Sends `text` (or the current draft), creating a session first when needed. */
  const submit = (text?: string) => {
    const value = (text ?? question).trim();
    if (value.length < 2 || ask.isPending || createSession.isPending) return;
    if (activeId) {
      ask.mutate({ sessionId: activeId, text: value });
      return;
    }
    createSession.mutate(undefined, {
      onSuccess: (data) => ask.mutate({ sessionId: data.data.id, text: value }),
    });
  };

  const activeSession = sessions.data?.data.find((item) => item.id === activeId);
  const messages = session.data?.data.messages ?? [];

  return {
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
  };
}
