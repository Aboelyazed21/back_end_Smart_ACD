import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { one } from '../../config/db';
import { AppError } from '../../utils/errors';
import { asyncHandler } from '../../utils/async';
import { writeAudit } from '../../utils/audit';
import { signQrToken } from '../../utils/crypto';
import { sanitizeText } from '../../utils/sanitize';
import { parsePage, paginated } from '../../utils/pagination';
import { requireStudentByUserId } from '../../services/studentContext';
import { parseTerm } from '../../services/term';
import {
  evaluateBulk,
  evaluateCourse,
  generateDraftPlan,
  getPlan,
  graduationAuditFor,
  listPlans,
  simulateGpa,
  standingFor,
  submitPlan,
  whatIfFor,
  earlyWarningFor,
} from '../../services/advising';
import * as service from './service';
import { createNotification, listNotifications, markAllRead, markRead } from '../../services/notifications';

function termFrom(req: Request) {
  return parseTerm(req.query.term ?? req.body?.term);
}

async function currentStudent(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return requireStudentByUserId(req.user.id);
}

export const profile = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await service.profileFor(student) });
});

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await service.dashboardFor(student, termFrom(req)) });
});

export const enrollments = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await service.enrollmentsFor(student) });
});

export const recommendedPlan = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const term = termFrom(req);
  const level = Number((req.query.level as string | undefined) ?? student.level);
  res.json({ data: await service.recommendedPlan(student, level, term) });
});

export const program = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await service.programInfo(student.program) });
});

export const eligibility = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const term = termFrom(req);
  const raw = req.query.courseCodes;
  const requested =
    typeof raw === 'string' && raw.trim()
      ? raw
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean)
      : [];
  const codes = requested.length
    ? requested
    : [
        ...new Set([
          ...(await service.failedCourseCodes(student.id)),
          ...(await service.candidateCourseCodes(student, term)),
        ]),
      ].slice(0, 100);
  const result = await evaluateBulk(student, codes, term, req.user?.id ?? null, {
    plannedCredits: req.query.plannedCredits ? Number(req.query.plannedCredits) : undefined,
    graduationPossible: student.passed_credits >= 115,
  });
  res.json({
    data: {
      term: term.term,
      decisions: result.decisions,
      plannedCredits: result.plannedCredits,
      loadDecision: result.loadDecision,
      escalations: result.escalations.map((item) => ({
        id: item.id,
        ticketNo: item.ticket_no,
        status: item.status,
      })),
      advisoryOnly: true,
    },
  });
});

export const courseEligibility = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const term = termFrom(req);
  const result = await evaluateCourse(student, req.params.courseCode!, term, req.user?.id ?? null, {
    plannedCredits: req.query.plannedCredits ? Number(req.query.plannedCredits) : undefined,
    graduationPossible: student.passed_credits >= 115,
  });
  res.json({
    data: {
      ...result,
      advisoryOnly: true,
    },
  });
});

export const standing = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await standingFor(student, termFrom(req)) });
});

export const earlyWarning = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await earlyWarningFor(student, termFrom(req)) });
});

export const graduationAudit = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await graduationAuditFor(student, termFrom(req)) });
});

export const gpaSimulate = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const result = await simulateGpa(student, termFrom(req), req.body.simulated, req.body.futureCgpaTarget);
  res.json({ data: result });
});

export const majorSwitch = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await whatIfFor(student, req.body.targetProgram) });
});

export const listMyPlans = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await listPlans(student.id) });
});

export const generatePlan = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  if (!req.user) throw AppError.unauthorized();
  const result = await generateDraftPlan(student, termFrom(req), req.user.id, {
    maxCredits: req.body.maxCredits,
    planningSlot: req.body.planningSlot,
    preferences: req.body.preferences,
    graduationPossible: student.passed_credits >= 115,
  });
  res.status(201).json({ data: result });
});

export const getMyPlan = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const result = await getPlan(req.params.id!);
  if ((result.plan as { student_id: string }).student_id !== student.id) {
    throw AppError.notFound('Study plan not found');
  }
  res.json({ data: result });
});

export const submitMyPlan = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: await submitPlan(student, req.params.id!, req.user.id) });
});

export const exportMyPlan = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const { plan, items } = await getPlan(req.params.id!);
  const planRow = plan as {
    id: string;
    student_id: string;
    term: string;
    status: string;
    total_credits: number;
    created_at: Date;
  };
  if (planRow.student_id !== student.id) throw AppError.notFound('Study plan not found');

  const now = Math.floor(Date.now() / 1000);
  const qrToken = signQrToken({
    planId: planRow.id,
    studentCode: student.student_code,
    issuedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60,
    v: 1,
  });
  const qrBuffer = await QRCode.toBuffer(qrToken, { type: 'png', width: 160, margin: 1 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="advising-plan-${planRow.id.slice(0, 8)}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  doc.fontSize(18).text('Smart Academic Advisor - Advisory Study Plan', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#444').text('DRAFT - advisory only. This is not a registration.', {
    align: 'center',
  });
  doc.moveDown();
  doc.fillColor('#000').fontSize(11);
  doc.text(`Student: ${student.full_name}`);
  doc.text(`Student code: ${student.student_code}`);
  doc.text(`Program: ${student.program}`);
  doc.text(`Term: ${planRow.term}`);
  doc.text(`Status: ${planRow.status}`);
  doc.text(`Total credits: ${planRow.total_credits}`);
  doc.text(`Generated: ${new Date(planRow.created_at).toISOString()}`);
  doc.moveDown();
  doc.fontSize(12).text('Courses', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  for (const item of items as Array<Record<string, unknown>>) {
    doc.text(
      `${item.course_code} - ${item.name_en} (${item.credits} credits) - ${item.rule_code} - Art. ${item.article}, p. ${item.page}`,
    );
  }
  doc.moveDown();
  doc
    .fontSize(9)
    .fillColor('#555')
    .text(
      'Eligibility, regulation references and anomalies are verified by the deterministic rule engine. ' +
        'Any appeal must be reviewed by an academic advisor and the college council.',
    );
  doc.image(qrBuffer, { fit: [120, 120], align: 'right' });
  doc.end();

  await writeAudit({
    actorId: req.user?.id ?? null,
    action: 'PLAN_EXPORTED',
    entityType: 'study_plan',
    entityId: planRow.id,
    ip: req.ip ?? null,
    correlationId: req.correlationId,
  });
});

export const myAdvisor = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const advisor = await service.advisorProfileFor(student);
  const slots = student.advisor_id ? await service.advisorsOfficeHours(student.advisor_id) : [];
  res.json({ data: { advisor, officeHours: slots } });
});

export const requestOfficeHour = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const slot = await one<{ id: string; advisor_id: string }>(
    `SELECT id, advisor_id FROM office_hour_slots WHERE id = $1 AND active = true`,
    [req.body.slotId],
  );
  if (!slot) throw AppError.notFound('Office hour slot not found');
  if (slot.advisor_id !== student.advisor_id) {
    throw AppError.forbidden('You can only request your assigned advisor office hours');
  }
  const existing = await one<{ id: string }>(
    `SELECT id FROM office_hour_requests
      WHERE slot_id = $1 AND student_id = $2 AND status IN ('pending','approved')`,
    [slot.id, student.id],
  );
  if (existing) throw AppError.conflict('REQUEST_EXISTS', 'You already requested this slot');
  const row = await one(
    `INSERT INTO office_hour_requests (slot_id, student_id, reason)
     VALUES ($1,$2,$3) RETURNING *`,
    [slot.id, student.id, req.body.reason ? sanitizeText(req.body.reason, 2000) : null],
  );
  await createNotification(
    student.user_id,
    'office_hour',
    'Office hour request submitted',
    'Your advisor will review the request.',
  );
  res.status(201).json({ data: row });
});

export const myOfficeHourRequests = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const rows = await service.listOfficeHourRequests(student.id);
  res.json({ data: rows });
});

export const notifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const page = parsePage(req.query as Record<string, unknown>);
  const result = await listNotifications(req.user.id, req.query.unread === 'true', page.limit, page.offset);
  res.json(paginated(result.rows, result.total, page));
});

export const readNotification = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await markRead(req.user.id, req.params.id!);
  res.status(204).send();
});

export const readAllNotifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: { updated: await markAllRead(req.user.id) } });
});
