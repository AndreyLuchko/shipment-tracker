import { z } from 'zod';
import { roleSchema } from './auth.ts';

/** The public face of another user: what a shipment's `client` and the client picker show. */
export const userSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const userListResponseSchema = z.object({
  items: z.array(userSummarySchema),
});
export type UserListResponse = z.infer<typeof userListResponseSchema>;

/** Query string of `GET /users` (dispatcher only); `role` is required. */
export const listUsersQuerySchema = z.object({
  role: roleSchema,
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
