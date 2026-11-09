import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { chatLimiter } from '../../middlewares/rateLimit';
import * as controller from './controller';
import { createSessionSchema, messageSchema, sessionIdParamSchema } from './schema';

export const chatRouter = Router();

// Open to every authenticated role (student / advisor / admin): the floating
// regulation assistant appears on all pages. Session ownership is per user.
chatRouter.use(requireAuth);
chatRouter.post('/sessions', validate({ body: createSessionSchema }), controller.createSession);
chatRouter.get('/sessions', controller.listSessions);
chatRouter.get('/sessions/:id', validate({ params: sessionIdParamSchema }), controller.getSession);
chatRouter.post(
  '/sessions/:id/messages',
  chatLimiter,
  validate({ params: sessionIdParamSchema, body: messageSchema }),
  controller.ask,
);
