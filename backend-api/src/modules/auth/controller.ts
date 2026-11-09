import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async';
import { AppError } from '../../utils/errors';
import * as service from './service';

export const csrf = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.issueCsrf(res));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.login(req.body.email, req.body.password, req, res));
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.refresh(req, res));
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await service.logout(req, res);
  res.status(204).send();
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  await service.logoutAll(req, res);
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json(await service.me(req.user.id));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await service.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword, req);
  res.status(204).send();
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await service.forgotPassword(req.body.email, req);
  res.json({ message: 'If the account exists, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await service.resetPassword(req.body.token, req.body.newPassword, req);
  res.status(204).send();
});

export const sessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ items: await service.listSessions(req.user.id) });
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await service.revokeSession(req.user.id, req.params.id!, req);
  res.status(204).send();
});
