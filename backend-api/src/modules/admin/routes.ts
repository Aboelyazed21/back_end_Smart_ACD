import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { requireAuth } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { importLimiter } from '../../middlewares/rateLimit';
import * as controller from './controller';
import {
  advisorUpdateSchema,
  analyticsLimitSchema,
  anomalyIdParamSchema,
  anomalyListQuerySchema,
  anomalyReopenSchema,
  anomalyResolveSchema,
  auditQuerySchema,
  courseIdParamSchema,
  courseListQuerySchema,
  createCourseSchema,
  createUserSchema,
  departmentSchema,
  departmentUpdateSchema,
  escalationQuerySchema,
  escalationUpdateSchema,
  idParamSchema,
  importListQuerySchema,
  offeringIdParamSchema,
  offeringSchema,
  offeringUpdateSchema,
  paginationSchema,
  prerequisiteIdParamSchema,
  prerequisiteSchema,
  ruleCodeParamSchema,
  ruleListQuerySchema,
  studentListQuerySchema,
  updateCourseSchema,
  updateStudentSchema,
  updateUserSchema,
  userListQuerySchema,
} from './schema';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
});

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/users', validate({ query: userListQuerySchema }), controller.usersList);
adminRouter.post('/users', validate({ body: createUserSchema }), controller.createUser);
adminRouter.patch(
  '/users/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  controller.updateUser,
);
adminRouter.delete('/users/:id', validate({ params: idParamSchema }), controller.deleteUser);
adminRouter.post(
  '/users/:id/reset-password',
  validate({ params: idParamSchema }),
  controller.resetUserPassword,
);

adminRouter.get('/advisors', controller.advisorsList);
adminRouter.patch(
  '/advisors/:id',
  validate({ params: idParamSchema, body: advisorUpdateSchema }),
  controller.updateAdvisor,
);

adminRouter.get('/students', validate({ query: studentListQuerySchema }), controller.studentsList);
adminRouter.get('/students/:id', validate({ params: idParamSchema }), controller.getStudent);
adminRouter.patch(
  '/students/:id',
  validate({ params: idParamSchema, body: updateStudentSchema }),
  controller.updateStudent,
);

adminRouter.get('/departments', controller.departments);
adminRouter.post('/departments', validate({ body: departmentSchema }), controller.createDepartment);
adminRouter.patch(
  '/departments/:id',
  validate({ params: idParamSchema, body: departmentUpdateSchema }),
  controller.updateDepartment,
);

adminRouter.get('/courses', validate({ query: courseListQuerySchema }), controller.courses);
adminRouter.post('/courses', validate({ body: createCourseSchema }), controller.createCourse);
adminRouter.get('/courses/:id', validate({ params: courseIdParamSchema }), controller.course);
adminRouter.patch(
  '/courses/:id',
  validate({ params: courseIdParamSchema, body: updateCourseSchema }),
  controller.updateCourse,
);
adminRouter.delete('/courses/:id', validate({ params: courseIdParamSchema }), controller.deleteCourse);
adminRouter.post(
  '/courses/:id/prerequisites',
  validate({ params: courseIdParamSchema, body: prerequisiteSchema }),
  controller.addPrerequisite,
);
adminRouter.delete(
  '/prerequisites/:id',
  validate({ params: prerequisiteIdParamSchema }),
  controller.deletePrerequisite,
);
adminRouter.post(
  '/courses/:id/offerings',
  validate({ params: courseIdParamSchema, body: offeringSchema }),
  controller.createOffering,
);
adminRouter.patch(
  '/offerings/:id',
  validate({ params: offeringIdParamSchema, body: offeringUpdateSchema }),
  controller.updateOffering,
);
adminRouter.delete('/offerings/:id', validate({ params: offeringIdParamSchema }), controller.deleteOffering);

adminRouter.get('/anomalies', validate({ query: anomalyListQuerySchema }), controller.anomalies);
adminRouter.get('/anomalies/:id', validate({ params: anomalyIdParamSchema }), controller.anomaly);
adminRouter.patch(
  '/anomalies/:id/resolve',
  validate({ params: anomalyIdParamSchema, body: anomalyResolveSchema }),
  controller.resolveAnomaly,
);
adminRouter.post(
  '/anomalies/:id/reopen',
  validate({ params: anomalyIdParamSchema, body: anomalyReopenSchema }),
  controller.reopenAnomaly,
);

adminRouter.get('/regulation/rules', validate({ query: ruleListQuerySchema }), controller.rules);
adminRouter.get('/regulation/rules/:code', validate({ params: ruleCodeParamSchema }), controller.rule);

adminRouter.get('/audit-logs', validate({ query: auditQuerySchema }), controller.auditLogs);
adminRouter.get('/escalations', validate({ query: escalationQuerySchema }), controller.escalations);
adminRouter.patch(
  '/escalations/:id',
  validate({ params: idParamSchema, body: escalationUpdateSchema }),
  controller.updateEscalationAdmin,
);

adminRouter.get('/analytics/overview', controller.analyticsOverview);
adminRouter.get(
  '/analytics/bottlenecks',
  validate({ query: analyticsLimitSchema }),
  controller.analyticsBottlenecks,
);
adminRouter.get('/analytics/enrollments', controller.analyticsEnrollment);
adminRouter.get('/analytics/escalations', controller.analyticsEscalations);
adminRouter.get('/analytics/plans', controller.analyticsPlans);

adminRouter.post('/imports/students', importLimiter, upload.single('file'), controller.importStudents);
adminRouter.post('/imports/transcripts', importLimiter, upload.single('file'), controller.importTranscripts);
adminRouter.get('/imports', validate({ query: importListQuerySchema }), controller.importJobs);
adminRouter.get('/imports/:id', validate({ params: idParamSchema }), controller.importJob);
adminRouter.get('/imports/:id/errors', validate({ params: idParamSchema }), controller.importJobErrors);

// Silence unused-import warnings for the shared pagination schema.
void paginationSchema;
