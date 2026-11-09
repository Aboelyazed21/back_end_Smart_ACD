import { z } from 'zod';

const uuid = z.string().uuid();
const page = z.coerce.number().int().min(1).optional();
const limit = z.coerce.number().int().min(1).max(100).optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const password = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/\d/)
  .regex(/[^A-Za-z0-9]/);

export const paginationSchema = z.object({ page, limit }).strict();

export const idParamSchema = z.object({ id: uuid }).strict();
export const courseIdParamSchema = z.object({ id: uuid }).strict();
export const offeringIdParamSchema = z.object({ id: uuid }).strict();
export const prerequisiteIdParamSchema = z.object({ id: uuid }).strict();
export const anomalyIdParamSchema = z.object({ id: z.string().regex(/^A-[A-Z]+-\d{2}$/) }).strict();
export const ruleCodeParamSchema = z.object({ code: z.string().min(3).max(40) }).strict();

export const userListQuerySchema = z
  .object({
    role: z.enum(['student', 'advisor', 'admin']).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    search: z.string().max(100).optional(),
    page,
    limit,
  })
  .strict();

export const createUserSchema = z
  .object({
    email: z.string().email().max(254),
    fullName: z.string().min(2).max(200),
    role: z.enum(['student', 'advisor', 'admin']),
    phone: z.string().max(30).optional(),
    password: password.optional(),
    isDemo: z.boolean().optional(),
    student: z
      .object({
        studentCode: z.string().regex(/^\d{6,15}$/),
        program: z.enum(['CS', 'IT', 'AI', 'DS']),
        level: z.number().int().min(1).max(4).optional(),
        advisorId: uuid.nullish(),
        departmentId: uuid.nullish(),
        admissionTerm: z.string().max(40).nullish(),
        cgpa: z.number().min(0).max(4).optional(),
        passedCredits: z.number().int().min(0).max(300).optional(),
        transferCredits: z.number().int().min(0).max(54).optional(),
      })
      .strict()
      .optional(),
    advisor: z
      .object({
        departmentId: uuid.nullish(),
        officeLocation: z.string().max(200).nullish(),
        maxStudents: z.number().int().min(1).max(500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: z.string().min(2).max(200).optional(),
    phone: z.string().max(30).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const studentListQuerySchema = z
  .object({
    program: z.enum(['CS', 'IT', 'AI', 'DS']).optional(),
    level: z.coerce.number().int().min(1).max(4).optional(),
    search: z.string().max(100).optional(),
    atRisk: z.enum(['true', 'false']).optional(),
    page,
    limit,
  })
  .strict();

export const updateStudentSchema = z
  .object({
    program: z.enum(['CS', 'IT', 'AI', 'DS']).optional(),
    level: z.number().int().min(1).max(4).optional(),
    advisorId: uuid.nullish(),
    departmentId: uuid.nullish(),
    admissionTerm: z.string().max(40).nullish(),
    cgpa: z.number().min(0).max(4).optional(),
    passedCredits: z.number().int().min(0).max(300).optional(),
    transferCredits: z.number().int().min(0).max(54).optional(),
    regularSemestersCompleted: z.number().int().min(0).max(40).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const departmentSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2,8}$/),
    nameAr: z.string().min(2).max(200),
    nameEn: z.string().min(2).max(200),
  })
  .strict();

export const departmentUpdateSchema = z
  .object({
    nameAr: z.string().min(2).max(200).optional(),
    nameEn: z.string().min(2).max(200).optional(),
  })
  .strict();

export const courseListQuerySchema = z
  .object({
    search: z.string().max(100).optional(),
    program: z.enum(['CS', 'IT', 'AI', 'DS']).optional(),
    level: z.coerce.number().int().min(1).max(4).optional(),
    active: z.enum(['true', 'false']).optional(),
    page,
    limit,
  })
  .strict();

const roleEnum = z.enum(['compulsory', 'lab', 'project', 'field_training', 'selected_topic', 'elective']);

export const createCourseSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{3}\d{4}$/),
    nameAr: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    credits: z.number().int().min(0).max(12),
    category: z.string().min(2).max(50),
    countsInGpa: z.boolean().optional(),
    levelHint: z.number().int().min(1).max(4),
    termHint: z.number().int().min(1).max(2),
    anomalyIds: z
      .array(z.string().regex(/^A-[A-Z]+-\d{2}$/))
      .max(20)
      .optional(),
    prerequisites: z
      .object({
        allOf: z
          .array(z.string().regex(/^[A-Z]{3}\d{4}$/))
          .max(10)
          .optional(),
        minPassedCreditHours: z.number().int().min(0).max(300).nullish(),
      })
      .strict()
      .optional(),
    roles: z.record(z.enum(['CS', 'IT', 'AI', 'DS']), roleEnum).optional(),
  })
  .strict();

export const updateCourseSchema = z
  .object({
    nameAr: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    credits: z.number().int().min(0).max(12).optional(),
    category: z.string().min(2).max(50).optional(),
    countsInGpa: z.boolean().optional(),
    levelHint: z.number().int().min(1).max(4).optional(),
    termHint: z.number().int().min(1).max(2).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const prerequisiteSchema = z
  .object({
    type: z.enum(['prerequisite', 'corequisite', 'hours_required']),
    requiredCourseCode: z
      .string()
      .regex(/^[A-Z]{3}\d{4}$/)
      .optional(),
    minPassedCreditHours: z.number().int().min(0).max(300).optional(),
  })
  .strict();

export const offeringSchema = z
  .object({
    academicYear: z.string().regex(/^\d{4}-\d{4}$/),
    season: z.enum(['fall', 'spring', 'summer']),
    capacity: z.number().int().min(0).max(1000).optional(),
    status: z.enum(['open', 'closed', 'cancelled']).optional(),
    meetingTimes: z
      .array(
        z
          .object({
            day: z.enum(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']),
            start: time,
            end: time,
            room: z.string().max(64).optional(),
          })
          .strict()
          .refine((value) => value.start < value.end, { message: 'start must precede end' }),
      )
      .max(10)
      .optional(),
    exam: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start: time,
        end: time,
        room: z.string().max(64).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const offeringUpdateSchema = z
  .object({
    capacity: z.number().int().min(0).max(1000).optional(),
    enrolledCount: z.number().int().min(0).max(1000).optional(),
    status: z.enum(['open', 'closed', 'cancelled']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const anomalyListQuerySchema = z
  .object({
    status: z.enum(['open', 'resolved']).optional(),
    severity: z.enum(['blocking', 'warning', 'info']).optional(),
    type: z.string().max(60).optional(),
    course: z
      .string()
      .regex(/^[A-Z]{3}\d{4}$/)
      .optional(),
    page,
    limit,
  })
  .strict();

export const anomalyResolveSchema = z
  .object({
    resolvedValue: z.string().min(2).max(5000),
    note: z.string().max(2000).optional(),
  })
  .strict();

export const anomalyReopenSchema = z.object({ reason: z.string().min(3).max(2000) }).strict();

export const ruleListQuerySchema = z
  .object({
    search: z.string().max(100).optional(),
    status: z.enum(['active', 'superseded']).optional(),
    page,
    limit,
  })
  .strict();

export const auditQuerySchema = z
  .object({
    actorId: uuid.optional(),
    entityType: z.string().max(60).optional(),
    entityId: z.string().max(100).optional(),
    action: z.string().max(100).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page,
    limit,
  })
  .strict();

export const importListQuerySchema = z
  .object({
    type: z.enum(['students', 'transcripts']).optional(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
    page,
    limit,
  })
  .strict();

export const escalationQuerySchema = z
  .object({
    status: z.enum(['open', 'in_review', 'resolved', 'closed']).optional(),
    type: z.enum(['RULE_ENGINE', 'PLAN_REVIEW', 'ACADEMIC', 'ANOMALY', 'IMPORT', 'OTHER']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    page,
    limit,
  })
  .strict();

export const escalationUpdateSchema = z
  .object({
    status: z.enum(['open', 'in_review', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    resolution: z.string().min(3).max(5000).optional(),
    assignedTo: uuid.nullish(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const advisorUpdateSchema = z
  .object({
    departmentId: uuid.nullish(),
    officeLocation: z.string().max(200).optional(),
    maxStudents: z.number().int().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const analyticsLimitSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
  .strict();
