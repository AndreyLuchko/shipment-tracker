import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  authResponseSchema,
  type PublicUser,
  type RegisterInput,
} from '@shipment-tracker/shared';

export interface TestSession {
  user: PublicUser;
  cookies: { access_token: string; csrf_token: string };
  /** The value to send in the `X-CSRF-Token` header on unsafe requests. */
  csrfToken: string;
}

/** Registers a user through `POST /api/v1/auth/register` and returns the user and its session cookies. */
export async function registerTestUser(
  app: FastifyInstance,
  overrides: Partial<RegisterInput> = {},
): Promise<TestSession> {
  const payload: RegisterInput = {
    email: `user-${randomUUID()}@example.com`,
    password: 'password123',
    name: 'Test User',
    role: 'CLIENT',
    ...overrides,
  };

  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
  if (response.statusCode !== 201) {
    throw new Error(`registerTestUser: expected 201, got ${response.statusCode}: ${response.body}`);
  }

  const { user } = authResponseSchema.parse(response.json());
  const byName = new Map(response.cookies.map((cookie) => [cookie.name, cookie.value]));
  const accessToken = byName.get(ACCESS_TOKEN_COOKIE_NAME);
  const csrfToken = byName.get(CSRF_COOKIE_NAME);
  if (accessToken === undefined || csrfToken === undefined) {
    throw new Error('registerTestUser: session cookies were not set');
  }

  return { user, cookies: { access_token: accessToken, csrf_token: csrfToken }, csrfToken };
}

/** Cookies plus the CSRF header of `session`, ready to spread into `app.inject({ … })`. */
export function sessionRequest(session: TestSession): {
  cookies: TestSession['cookies'];
  headers: Record<string, string>;
} {
  return { cookies: session.cookies, headers: { [CSRF_HEADER_NAME]: session.csrfToken } };
}
