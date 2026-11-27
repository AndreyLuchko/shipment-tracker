import { z } from 'zod';

export const roleSchema = z.enum(['DISPATCHER', 'CLIENT']);
export type Role = z.infer<typeof roleSchema>;

/** Trimmed and lowercased before validation, so the same address in any case/spacing is one account. */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254, 'Email must be at most 254 characters'));

/** Passwords are never trimmed: surrounding spaces are part of the secret. */
const registerPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');
const loginPasswordSchema = z
  .string()
  .min(1, 'Enter your password')
  .max(128, 'Password must be at most 128 characters');

/** Public sign-up always creates a CLIENT: there is no `role` field, and a `role` key in the body is stripped. */
export const registerSchema = z.object({
  email: emailSchema,
  password: registerPasswordSchema,
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Name must be at most 100 characters'),
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
