import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { authLimiter } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import * as controller from './controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  sessionIdSchema,
} from './schema';

export const authRouter = Router();

authRouter.get('/csrf', controller.csrf);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/refresh', authLimiter, controller.refresh);
authRouter.post('/logout', requireAuth, controller.logout);
authRouter.post('/logout-all', requireAuth, controller.logoutAll);
authRouter.get('/me', requireAuth, controller.me);
authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);
authRouter.get('/sessions', requireAuth, controller.sessions);
authRouter.delete(
  '/sessions/:id',
  requireAuth,
  validate({ params: sessionIdSchema }),
  controller.revokeSession,
);
