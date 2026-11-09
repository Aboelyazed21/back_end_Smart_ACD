import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import * as controller from './controller';
import {
  eligibilityQuerySchema,
  escalationQuerySchema,
  escalationUpdateSchema,
  noteSchema,
  officeHourSchema,
  officeHourStatusSchema,
  officeHourUpdateSchema,
  planIdParamSchema,
  planListQuerySchema,
  planReviewSchema,
  requestIdParamSchema,
  slotIdParamSchema,
  studentIdParamSchema,
  studentListQuerySchema,
  termQuerySchema,
} from './schema';

export const advisorRouter = Router();

advisorRouter.use(requireAuth, requireRole('advisor'));

advisorRouter.get('/dashboard', controller.dashboard);
advisorRouter.get('/students', validate({ query: studentListQuerySchema }), controller.students);
advisorRouter.get('/at-risk', controller.atRisk);
advisorRouter.get('/students/:id', validate({ params: studentIdParamSchema }), controller.studentDetail);
advisorRouter.get(
  '/students/:id/standing',
  validate({ params: studentIdParamSchema, query: termQuerySchema }),
  controller.studentStanding,
);
advisorRouter.get(
  '/students/:id/eligibility',
  validate({ params: studentIdParamSchema, query: eligibilityQuerySchema }),
  controller.studentEligibility,
);
advisorRouter.get(
  '/students/:id/graduation-audit',
  validate({ params: studentIdParamSchema, query: termQuerySchema }),
  controller.studentGraduation,
);
advisorRouter.get(
  '/students/:id/early-warning',
  validate({ params: studentIdParamSchema, query: termQuerySchema }),
  controller.studentEarlyWarning,
);
advisorRouter.get('/students/:id/notes', validate({ params: studentIdParamSchema }), controller.studentNotes);
advisorRouter.post(
  '/students/:id/notes',
  validate({ params: studentIdParamSchema, body: noteSchema }),
  controller.createNote,
);

advisorRouter.get('/plans', validate({ query: planListQuerySchema }), controller.plans);
advisorRouter.patch(
  '/plans/:id/review',
  validate({ params: planIdParamSchema, body: planReviewSchema }),
  controller.reviewPlan,
);

advisorRouter.get('/office-hours', controller.officeHours);
advisorRouter.post('/office-hours', validate({ body: officeHourSchema }), controller.createOfficeHour);
advisorRouter.patch(
  '/office-hours/:id',
  validate({ params: slotIdParamSchema, body: officeHourUpdateSchema }),
  controller.updateOfficeHour,
);
advisorRouter.delete(
  '/office-hours/:id',
  validate({ params: slotIdParamSchema }),
  controller.deleteOfficeHour,
);
advisorRouter.get('/office-hour-requests', controller.officeHourRequests);
advisorRouter.patch(
  '/office-hour-requests/:id',
  validate({ params: requestIdParamSchema, body: officeHourStatusSchema }),
  controller.updateOfficeHourRequest,
);

advisorRouter.get('/escalations', validate({ query: escalationQuerySchema }), controller.escalations);
advisorRouter.patch(
  '/escalations/:id',
  validate({ params: requestIdParamSchema, body: escalationUpdateSchema }),
  controller.updateEscalationById,
);
