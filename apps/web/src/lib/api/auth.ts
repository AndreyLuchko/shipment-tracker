import {
  authResponseSchema,
  CSRF_COOKIE_NAME,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from '@shipment-tracker/shared';

import { apiRequest, readCookie } from '@/lib/api/client';

/** POST /auth/login → the signed-in user. The API sets both session cookies. */
export async function login(input: LoginInput): Promise<PublicUser> {
  const { user } = await apiRequest('/auth/login', { method: 'POST', body: input, schema: authResponseSchema });
  return user;
}

/** POST /auth/register → the new user, already signed in. */
export async function register(input: RegisterInput): Promise<PublicUser> {
  const { user } = await apiRequest('/auth/register', { method: 'POST', body: input, schema: authResponseSchema });
  return user;
}

/** POST /auth/logout (no body). The API clears both cookies. */
export function logout(): Promise<void> {
  return apiRequest('/auth/logout', { method: 'POST' });
}

/** GET /auth/me as a session probe: its 401 does not fire the session-expired handler. */
export async function fetchCurrentUser(): Promise<PublicUser> {
  const { user } = await apiRequest('/auth/me', { schema: authResponseSchema, sessionProbe: true });
  return user;
}

/** Whether a session may exist: the readable `csrf_token` cookie is there. */
export function hasSessionHint(): boolean {
  return readCookie(CSRF_COOKIE_NAME) !== undefined;
}
