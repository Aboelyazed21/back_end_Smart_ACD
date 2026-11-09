import { z } from 'zod';

const courseCode = z.string().regex(/^[A-Z]{3}\d{4}$/, 'invalid course code');
const term = z.string().min(1).max(40).optional();

export const termQuerySchema = z
  .object({ term, week: z.coerce.number().int().min(0).max(30).optional() })
  .strict();

export const recommendedQuerySchema = z
  .object({
    term,
    level: z.coerce.number().int().min(1).max(4).optional(),
  })
  .strict();

export const eligibilityQuerySchema = z
  .object({
    term,
    week: z.coerce.number().int().min(0).max(30).optional(),
    courseCodes: z.string().max(800).optional(),
    plannedCredits: z.coerce.number().int().min(0).max(21).optional(),
  })
  .strict();

export const courseCodeParamSchema = z.object({ courseCode }).strict();

export const gpaSimulateSchema = z
  .object({
    term,
    simulated: z
      .array(
        z
          .object({
            courseCode,
            percentage: z.number().min(0).max(100).nullish(),
            gradeLetter: z.string().min(1).max(2).nullish(),
          })
          .strict()
          .refine((item) => item.percentage != null || item.gradeLetter != null, {
            message: 'percentage or gradeLetter is required',
          }),
      )
      .min(1)
      .max(30),
    futureCgpaTarget: z.number().min(0).max(4).nullish(),
  })
  .strict();

export const majorSwitchSchema = z.object({ targetProgram: z.enum(['CS', 'IT', 'AI', 'DS']) }).strict();

export const planIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const generatePlanSchema = z
  .object({
    term,
    week: z.number().int().min(0).max(30).optional(),
    maxCredits: z.number().int().min(0).max(21).optional(),
    planningSlot: z
      .string()
      .regex(/^[1-4]-[12]$/)
      .optional(),
    preferences: z
      .object({
        avoid_days: z
          .array(z.enum(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']))
          .max(7)
          .optional(),
        compress_days: z.boolean().optional(),
        prefer_morning: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const notificationParamSchema = z.object({ id: z.string().uuid() }).strict();

export const notificationQuerySchema = z
  .object({
    unread: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const officeHourRequestSchema = z
  .object({ slotId: z.string().uuid(), reason: z.string().max(1000).optional() })
  .strict();
