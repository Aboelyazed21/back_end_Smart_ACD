import { Request, Response } from 'express';
import { AppError } from '../../utils/errors';
import { asyncHandler } from '../../utils/async';
import { findStudentByUserId } from '../../services/studentContext';
import { parseTerm } from '../../services/term';
import * as service from './service';

/** Any authenticated role may chat; only students carry a student profile. */
async function chatActor(req: Request): Promise<service.ChatActor> {
  if (!req.user) throw AppError.unauthorized();
  const student = await findStudentByUserId(req.user.id);
  return { id: req.user.id, student };
}

export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const actor = await chatActor(req);
  res.status(201).json({ data: await service.createSession(actor, req.body.title) });
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const actor = await chatActor(req);
  res.json({ data: await service.listSessions(actor) });
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const actor = await chatActor(req);
  res.json({ data: await service.getSession(actor, req.params.id!) });
});

export const ask = asyncHandler(async (req: Request, res: Response) => {
  const actor = await chatActor(req);
  const result = await service.ask(
    actor,
    req.params.id!,
    req.body.question,
    req.body.language ?? 'auto',
    parseTerm(req.body.term),
    req.user?.id ?? null,
  );
  res.json({ data: result });
});
