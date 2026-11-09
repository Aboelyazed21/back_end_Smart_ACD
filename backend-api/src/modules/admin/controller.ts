import { Request, Response } from 'express';
import { AppError } from '../../utils/errors';
import { asyncHandler } from '../../utils/async';
import { parsePage, paginated } from '../../utils/pagination';
import { getEscalation, updateEscalation } from '../../services/escalations';
import * as users from './usersService';
import * as academics from './academicsService';
import * as anomalyService from './anomaliesService';
import * as analytics from './analyticsService';
import * as imports from './importsService';
import * as audit from './auditService';
import { createNotification } from '../../services/notifications';

function context(req: Request) {
  return { ip: req.ip ?? null, correlationId: req.correlationId };
}

function pageOf(req: Request) {
  return parsePage(req.query as Record<string, unknown>);
}

export const usersList = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await users.listUsers({
    role: req.query.role as string | undefined,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.status(201).json({ data: await users.createUser(req.body, req.user.id, context(req)) });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: await users.updateUser(req.params.id!, req.body, req.user.id, context(req)) });
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await users.softDeleteUser(req.params.id!, req.user.id, context(req));
  res.status(204).send();
});

export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await users.resetUserPassword(req.params.id!, req.user.id, context(req));
  res.json({ data: { message: 'A temporary password has been sent to the account email.' } });
});

export const advisorsList = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await users.listAdvisors() });
});

export const updateAdvisor = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: await users.updateAdvisor(req.params.id!, req.body, req.user.id) });
});

export const studentsList = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await academics.listStudents({
    program: req.query.program as string | undefined,
    level: req.query.level ? Number(req.query.level) : undefined,
    search: req.query.search as string | undefined,
    atRisk: req.query.atRisk === 'true',
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const getStudent = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await academics.getStudent(req.params.id!) });
});

export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: await academics.updateStudent(req.params.id!, req.body, req.user.id) });
});

export const departments = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await academics.listDepartments() });
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.status(201).json({ data: await academics.createDepartment(req.body, req.user.id) });
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: await academics.updateDepartment(req.params.id!, req.body, req.user.id) });
});

export const courses = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await academics.listCourses({
    search: req.query.search as string | undefined,
    program: req.query.program as string | undefined,
    level: req.query.level ? Number(req.query.level) : undefined,
    active: req.query.active === undefined ? undefined : req.query.active === 'true',
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const course = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await academics.getCourse(req.params.id!) });
});

export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.status(201).json({ data: await academics.createCourse(req.body, req.user.id) });
});

export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: await academics.updateCourse(req.params.id!, req.body, req.user.id) });
});

export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await academics.deleteCourse(req.params.id!, req.user.id);
  res.status(204).send();
});

export const addPrerequisite = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.status(201).json({
    data: await academics.addPrerequisite(req.params.id!, req.body, req.user.id),
  });
});

export const deletePrerequisite = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await academics.deletePrerequisite(req.params.id!, req.user.id);
  res.status(204).send();
});

export const createOffering = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.status(201).json({
    data: await academics.createOffering(req.params.id!, req.body, req.user.id),
  });
});

export const updateOffering = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await academics.updateOffering(req.params.id!, req.body, req.user.id),
  });
});

export const deleteOffering = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await academics.deleteOffering(req.params.id!, req.user.id);
  res.status(204).send();
});

export const anomalies = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await anomalyService.listAnomalies({
    status: req.query.status as string | undefined,
    severity: req.query.severity as string | undefined,
    type: req.query.type as string | undefined,
    course: req.query.course as string | undefined,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const anomaly = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await anomalyService.getAnomaly(req.params.id!) });
});

export const resolveAnomaly = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await anomalyService.resolveAnomaly(req.params.id!, req.body, req.user.id, context(req)),
  });
});

export const reopenAnomaly = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await anomalyService.reopenAnomaly(req.params.id!, req.user.id, req.body.reason),
  });
});

export const rules = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await audit.listRules({
    search: req.query.search as string | undefined,
    status: req.query.status as string | undefined,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const rule = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await audit.getRule(req.params.code!) });
});

export const auditLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await audit.listAuditLogs({
    actorId: req.query.actorId as string | undefined,
    entityType: req.query.entityType as string | undefined,
    entityId: req.query.entityId as string | undefined,
    action: req.query.action as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const escalations = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await audit.listAllEscalations({
    status: req.query.status as string | undefined,
    type: req.query.type as string | undefined,
    priority: req.query.priority as string | undefined,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const updateEscalationAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const before = await getEscalation(req.params.id!);
  if (req.body.assignedTo) {
    const assignee = await import('../../config/db').then(({ one }) =>
      one<{ id: string; role: string }>(
        "SELECT id, role FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL",
        [req.body.assignedTo],
      ),
    );
    if (!assignee || !['advisor', 'admin'].includes(assignee.role)) {
      throw AppError.badRequest('INVALID_ASSIGNEE', 'Assignee must be an active advisor or admin');
    }
  }
  const updated = await updateEscalation(req.params.id!, req.user.id, {
    status: req.body.status,
    priority: req.body.priority,
    resolution: req.body.resolution,
    assignedTo: req.body.assignedTo === undefined ? undefined : req.body.assignedTo,
  });
  if (req.body.assignedTo && req.body.assignedTo !== before.assigned_to) {
    await createNotification(
      req.body.assignedTo,
      'escalation',
      `Case assigned: ${updated.ticket_no}`,
      updated.subject,
    );
  }
  res.json({ data: updated });
});

export const analyticsOverview = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await analytics.overview() });
});

export const analyticsBottlenecks = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  res.json({ data: await analytics.bottlenecks(limit) });
});

export const analyticsEnrollment = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await analytics.enrollmentStats() });
});

export const analyticsEscalations = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await analytics.escalationStats() });
});

export const analyticsPlans = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await analytics.planStats() });
});

export const importStudents = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.status(202).json({ data: await imports.importStudents(req.file, req.user.id) });
});

export const importTranscripts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.status(202).json({ data: await imports.importTranscripts(req.file, req.user.id) });
});

export const importJobs = asyncHandler(async (req: Request, res: Response) => {
  const page = pageOf(req);
  const result = await imports.listJobs({
    type: req.query.type as string | undefined,
    status: req.query.status as string | undefined,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const importJob = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await imports.getJob(req.params.id!) });
});

export const importJobErrors = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await imports.jobErrors(req.params.id!) });
});
