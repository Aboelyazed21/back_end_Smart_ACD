import { Request, Response } from 'express';
import { AppError } from '../../utils/errors';
import { asyncHandler } from '../../utils/async';
import { parsePage, paginated } from '../../utils/pagination';
import { parseTerm } from '../../services/term';
import { updateEscalation } from '../../services/escalations';
import * as service from './service';

async function currentAdvisor(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return service.requireAdvisor(req.user.id);
}

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.dashboard(await currentAdvisor(req)) });
});

export const students = asyncHandler(async (req: Request, res: Response) => {
  const advisor = await currentAdvisor(req);
  const page = parsePage(req.query as Record<string, unknown>);
  const result = await service.listStudents(advisor, {
    search: req.query.search as string | undefined,
    page: page.page,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});

export const atRisk = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.atRisk(await currentAdvisor(req)) });
});

export const studentDetail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ data: await service.studentDetail(req.user, req.params.id!) });
});

export const studentStanding = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await service.studentStanding(req.user, req.params.id!, parseTerm(req.query.term)),
  });
});

export const studentEligibility = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const raw = req.query.courseCodes;
  const codes =
    typeof raw === 'string' && raw.trim()
      ? raw
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean)
      : undefined;
  const result = await service.studentEligibility(req.user, req.params.id!, parseTerm(req.query.term), codes);
  res.json({ data: result });
});

export const studentGraduation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await service.studentGraduation(req.user, req.params.id!, parseTerm(req.query.term)),
  });
});

export const studentEarlyWarning = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await service.studentEarlyWarning(req.user, req.params.id!, parseTerm(req.query.term)),
  });
});

export const plans = asyncHandler(async (req: Request, res: Response) => {
  const advisor = await currentAdvisor(req);
  res.json({ data: await service.pendingPlans(advisor, req.query.status as string | undefined) });
});

export const reviewPlan = asyncHandler(async (req: Request, res: Response) => {
  const advisor = await currentAdvisor(req);
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await service.review(advisor, req.params.id!, req.user.id, req.body.decision, req.body.feedback),
  });
});

export const studentNotes = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  // Object-level access is checked by the service before notes are returned.
  await service.getStudentForActor(req.user, req.params.id!);
  res.json({ data: await service.notes(req.user.id, req.params.id!, req.user.role) });
});

export const createNote = asyncHandler(async (req: Request, res: Response) => {
  const advisor = await currentAdvisor(req);
  if (!req.user) throw AppError.unauthorized();
  res.status(201).json({
    data: await service.createNote(advisor, req.params.id!, req.body.note, req.body.visibility, req.user.id),
  });
});

export const officeHours = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.officeHours(await currentAdvisor(req)) });
});

export const createOfficeHour = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({
    data: await service.createOfficeHour(await currentAdvisor(req), req.body),
  });
});

export const updateOfficeHour = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    data: await service.updateOfficeHour(await currentAdvisor(req), req.params.id!, req.body),
  });
});

export const deleteOfficeHour = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteOfficeHour(await currentAdvisor(req), req.params.id!);
  res.status(204).send();
});

export const officeHourRequests = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.officeHourRequests(await currentAdvisor(req)) });
});

export const updateOfficeHourRequest = asyncHandler(async (req: Request, res: Response) => {
  const advisor = await currentAdvisor(req);
  if (!req.user) throw AppError.unauthorized();
  res.json({
    data: await service.updateOfficeHourRequest(advisor, req.params.id!, req.body.status, req.user.id),
  });
});

export const escalations = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    data: await service.advisorEscalations(await currentAdvisor(req), req.query.status as string | undefined),
  });
});

export const updateEscalationById = asyncHandler(async (req: Request, res: Response) => {
  const advisor = await currentAdvisor(req);
  if (!req.user) throw AppError.unauthorized();
  const allowed = await service.advisorEscalations(advisor);
  if (!allowed.some((row) => (row as { id: string }).id === req.params.id)) {
    throw AppError.notFound('Escalation not found');
  }
  res.json({
    data: await updateEscalation(req.params.id!, req.user.id, {
      status: req.body.status,
      priority: req.body.priority,
      resolution: req.body.resolution,
    }),
  });
});

export const myStudentsForLookup = asyncHandler(async (req: Request, res: Response) => {
  const advisor = await currentAdvisor(req);
  const page = parsePage(req.query as Record<string, unknown>);
  const result = await service.listStudents(advisor, {
    page: page.page,
    limit: page.limit,
    offset: page.offset,
  });
  res.json(paginated(result.rows, result.total, page));
});
