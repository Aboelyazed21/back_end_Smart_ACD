import { z } from 'zod';

const password = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, 'must include a lower-case letter')
  .regex(/[A-Z]/, 'must include an upper-case letter')
  .regex(/\d/, 'must include a digit')
  .regex(/[^A-Za-z0-9]/, 'must include a symbol');

export const loginSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().email().max(254),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16).max(512),
    newPassword: password,
  })
  .strict();

export const sessionIdSchema = z.object({ id: z.string().uuid() }).strict();
