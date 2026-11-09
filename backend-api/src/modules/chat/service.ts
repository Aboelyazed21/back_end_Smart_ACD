import { many, one } from '../../config/db';
import { engineClient } from '../../integrations/engineClient';
import { AppError } from '../../utils/errors';
import { sanitizeText } from '../../utils/sanitize';
import { StudentRow } from '../../services/studentContext';
import { createEscalation, EscalationRow } from '../../services/escalations';
import { Term, termToEngine } from '../../services/term';
import { writeAudit } from '../../utils/audit';

interface RagResult {
  answer: string;
  answer_language: 'ar' | 'en';
  citations: Array<Record<string, unknown>>;
  confidence: number;
  escalate: boolean;
  escalate_reason?: string | null;
  anomaly_ids?: string[];
  flags?: string[];
}

/** The authenticated account behind a chat; students also carry a profile. */
export interface ChatActor {
  id: string;
  student: StudentRow | null;
}

function cleanQuestion(question: string): string {
  const cleaned = sanitizeText(question, 1500);
  if (cleaned.length < 2) {
    throw AppError.badRequest('INVALID_QUESTION', 'Question is empty after sanitisation');
  }
  return cleaned;
}

export async function createSession(actor: ChatActor, title?: string) {
  const row = await one<Record<string, unknown>>(
    `INSERT INTO chat_sessions (student_id, user_id, title) VALUES ($1,$2,$3) RETURNING *`,
    [
      actor.student?.id ?? null,
      actor.id,
      title ? sanitizeText(title, 120) : 'Advising chat',
    ],
  );
  return row;
}

export async function listSessions(actor: ChatActor) {
  return many(
    `SELECT s.id, s.title, s.created_at, s.updated_at,
            (SELECT count(*)::int FROM chat_messages m WHERE m.session_id = s.id) AS message_count
       FROM chat_sessions s WHERE s.user_id = $1 ORDER BY s.updated_at DESC LIMIT 50`,
    [actor.id],
  );
}

export async function getSession(actor: ChatActor, sessionId: string) {
  const session = await one<{ id: string; student_id: string | null; title: string }>(
    'SELECT id, student_id, title FROM chat_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, actor.id],
  );
  if (!session) {
    throw AppError.notFound('Chat session not found');
  }
  const messages = await many(
    `SELECT id, role, content, citations, confidence, escalated, rule_code, created_at
       FROM chat_messages WHERE session_id = $1 ORDER BY created_at`,
    [sessionId],
  );
  return { session, messages };
}

export async function ask(
  actor: ChatActor,
  sessionId: string,
  question: string,
  language: 'ar' | 'en' | 'auto',
  term: Term,
  actorId: string | null,
) {
  const session = await one<{ id: string }>(
    'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, actor.id],
  );
  if (!session) throw AppError.notFound('Chat session not found');
  const cleaned = cleanQuestion(question);
  // Snapshot prior turns before inserting the current question so the engine's
  // generator gets conversational context without duplicating this message.
  const prior = await many<{ role: string; content: string }>(
    `SELECT role, content FROM chat_messages
      WHERE session_id = $1 AND role IN ('user','assistant')
      ORDER BY created_at DESC LIMIT 8`,
    [sessionId],
  );
  const history = prior.reverse().map((row) => ({ role: row.role, content: row.content }));
  const userMessage = await one<Record<string, unknown>>(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'user',$2) RETURNING *`,
    [sessionId, cleaned],
  );
  let result: RagResult;
  try {
    result = await engineClient.ask<RagResult>({
      question: cleaned,
      language,
      // Advisor/admin questions carry no student profile: the engine answers
      // from the regulation only, without personalisation.
      student_id: actor.student?.id ?? null,
      term: termToEngine(term),
      history,
    });
  } catch (error) {
    // Keep the conversation recoverable but never fabricate an answer.
    throw error;
  }
  const assistant = await one<Record<string, unknown>>(
    `INSERT INTO chat_messages
       (session_id, role, content, citations, confidence, escalated, rule_code)
     VALUES ($1,'assistant',$2,$3,$4,$5,$6) RETURNING *`,
    [
      sessionId,
      result.answer,
      JSON.stringify(result.citations ?? []),
      result.confidence,
      result.escalate,
      result.flags?.find((flag) => flag.startsWith('RULE_')) ?? null,
    ],
  );
  await one('UPDATE chat_sessions SET updated_at = now() WHERE id = $1', [sessionId]);

  let escalation: EscalationRow | null = null;
  // Escalations are student-bound by schema: only a student-owned low-confidence
  // answer opens a ticket. Advisors/admins see the flag and handle it themselves.
  if (result.escalate && actor.student) {
    escalation = await createEscalation({
      studentId: actor.student.id,
      createdBy: actorId,
      type: (result.anomaly_ids?.length ?? 0) > 0 ? 'ANOMALY' : 'ACADEMIC',
      priority: 'medium',
      subject: 'Bylaw question requires advisor review',
      description: [
        `Question: ${cleaned}`,
        `Reason: ${result.escalate_reason ?? 'Low retrieval confidence'}`,
        result.anomaly_ids?.length ? `Anomalies: ${result.anomaly_ids.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      anomalyIds: result.anomaly_ids ?? [],
      dedupe: false,
    });
    await writeAudit({
      actorId,
      action: 'RAG_ESCALATED',
      entityType: 'chat_message',
      entityId: String(assistant?.id ?? ''),
      after: {
        confidence: result.confidence,
        anomalyIds: result.anomaly_ids ?? [],
        ticketNo: escalation.ticket_no,
      },
    });
  }
  return {
    userMessage,
    assistant,
    answer: result.answer,
    citations: result.citations,
    confidence: result.confidence,
    escalate: result.escalate,
    escalateReason: result.escalate_reason ?? null,
    anomalyIds: result.anomaly_ids ?? [],
    escalation: escalation
      ? { id: escalation.id, ticketNo: escalation.ticket_no, status: escalation.status }
      : null,
    advisoryOnly: true,
  };
}
