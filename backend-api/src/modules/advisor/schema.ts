import { z } from 'zod';

const term = z.string().min(1).max(40).optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const studentIdParamSchema = z.object({ id: z.string().uuid() }).strict();
export const planIdParamSchema = z.object({ id: z.string().uuid() }).strict();
export const requestIdParamSchema = z.object({ id: z.string().uuid() }).strict();
export const noteIdParamSchema = z.object({ id: z.string().uuid() }).strict();
export const slotIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const termQuerySchema = z.object({ term }).strict();

export const studentListQuerySchema = z
  .object({
    search: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const eligibilityQuerySchema = z
  .object({
    term,
    courseCodes: z.string().max(800).optional(),
  })
  .strict();

export const planReviewSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED', 'MODIFIED']),
    feedback: z.string().min(3).max(2000),
  })
  .strict();

export const planListQuerySchema = z
  .object({ status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'MODIFIED', 'REJECTED']).optional() })
  .strict();

export const noteSchema = z
  .object({
    note: z.string().min(1).max(5000),
    visibility: z.enum(['advisor_only', 'student']).default('advisor_only'),
  })
  .strict();

export const officeHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: time,
    endTime: time,
    location: z.string().max(200).optional(),
  })
  .strict()
  .refine((value) => value.startTime < value.endTime, { message: 'startTime must precede endTime' });

export const officeHourUpdateSchema = z
  .object({
    weekday: z.number().int().min(0).max(6).optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    location: z.string().max(200).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

export const officeHourStatusSchema = z
  .object({ status: z.enum(['approved', 'rejected', 'cancelled']) })
  .strict();

export const escalationQuerySchema = z
  .object({ status: z.enum(['open', 'in_review', 'resolved', 'closed']).optional() })
  .strict();

export const escalationUpdateSchema = z
  .object({
    status: z.enum(['open', 'in_review', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    resolution: z.string().min(3).max(5000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });
