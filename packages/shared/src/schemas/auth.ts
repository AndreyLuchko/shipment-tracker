import { z } from 'zod';

export const roleSchema = z.enum(['DISPATCHER', 'CLIENT']);
export type Role = z.infer<typeof roleSchema>;

/** Trimmed and lowercased before validation, so the same address in any case/spacing is one account. */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Passwords are never trimmed: surrounding spaces are part of the secret. */
const registerPasswordSchema = z.string().min(8).max(128);
const loginPasswordSchema = z.string().min(1).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: registerPasswordSchema,
  name: z.string().trim().min(1).max(100),
  role: roleSchema.default('CLIENT'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  createdAt: z.iso.datetime(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  user: publicUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
