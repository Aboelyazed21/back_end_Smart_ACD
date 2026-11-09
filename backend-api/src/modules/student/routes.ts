import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { exportLimiter } from '../../middlewares/rateLimit';
import * as controller from './controller';
import {
  courseCodeParamSchema,
  eligibilityQuerySchema,
  gpaSimulateSchema,
  generatePlanSchema,
  majorSwitchSchema,
  notificationParamSchema,
  notificationQuerySchema,
  officeHourRequestSchema,
  planIdParamSchema,
  recommendedQuerySchema,
  termQuerySchema,
} from './schema';

export const studentRouter = Router();

studentRouter.use(requireAuth, requireRole('student'));

studentRouter.get('/profile', controller.profile);
studentRouter.get('/dashboard', validate({ query: termQuerySchema }), controller.dashboard);
studentRouter.get('/enrollments', controller.enrollments);
studentRouter.get(
  '/recommended-plan',
  validate({ query: recommendedQuerySchema }),
  controller.recommendedPlan,
);
studentRouter.get('/courses', controller.program);
studentRouter.get('/eligibility', validate({ query: eligibilityQuerySchema }), controller.eligibility);
studentRouter.get(
  '/eligibility/:courseCode',
  validate({ params: courseCodeParamSchema, query: eligibilityQuerySchema }),
  controller.courseEligibility,
);
studentRouter.get('/standing', validate({ query: termQuerySchema }), controller.standing);
studentRouter.get('/early-warning', validate({ query: termQuerySchema }), controller.earlyWarning);
studentRouter.get('/graduation-audit', validate({ query: termQuerySchema }), controller.graduationAudit);
studentRouter.post('/gpa/simulate', validate({ body: gpaSimulateSchema }), controller.gpaSimulate);
studentRouter.post('/whatif/major-switch', validate({ body: majorSwitchSchema }), controller.majorSwitch);

studentRouter.get('/plans', controller.listMyPlans);
studentRouter.post('/plans', validate({ body: generatePlanSchema }), controller.generatePlan);
studentRouter.get('/plans/:id', validate({ params: planIdParamSchema }), controller.getMyPlan);
studentRouter.post('/plans/:id/submit', validate({ params: planIdParamSchema }), controller.submitMyPlan);
studentRouter.get(
  '/plans/:id/export',
  exportLimiter,
  validate({ params: planIdParamSchema }),
  controller.exportMyPlan,
);

studentRouter.get('/advisor', controller.myAdvisor);
studentRouter.post(
  '/office-hours/requests',
  validate({ body: officeHourRequestSchema }),
  controller.requestOfficeHour,
);
studentRouter.get('/office-hours/requests', controller.myOfficeHourRequests);

studentRouter.get('/notifications', validate({ query: notificationQuerySchema }), controller.notifications);
studentRouter.patch(
  '/notifications/:id/read',
  validate({ params: notificationParamSchema }),
  controller.readNotification,
);
studentRouter.post('/notifications/read-all', controller.readAllNotifications);
