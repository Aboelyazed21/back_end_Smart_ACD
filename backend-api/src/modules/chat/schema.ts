import { z } from 'zod';

export const createSessionSchema = z.object({ title: z.string().min(1).max(120).optional() }).strict();

export const sessionIdParamSchema = z.object({ id: z.string().uuid() }).strict();

export const askSchema = z
  .object({
    question: z.string().min(2).max(1500),
    language: z.enum(['ar', 'en', 'auto']).optional(),
    term: z.string().min(1).max(40).optional(),
  })
  .strict();

export const messageSchema = z
  .object({
    question: z.string().min(2).max(1500),
    language: z.enum(['ar', 'en', 'auto']).optional(),
  })
  .strict();
