import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME, authResponseSchema } from '@shipment-tracker/shared';
import { hashPassword } from '../../../src/lib/password.js';
import type { SessionClaims } from '../../../src/plugins/auth.js';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';

const URL = '/api/v1/auth/login';
const CREDENTIALS = { email: 'client@example.com', password: 'password123' };
const INVALID = { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };

describe('POST /api/v1/auth/login', () => {
  let app: FastifyInstance;
  let registered: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    registered = await registerTestUser(app, CREDENTIALS);
  });

  afterAll(async () => {
    await app.close();
  });

  function login(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: URL, payload });
  }

  function cookiesByName(response: Awaited<ReturnType<typeof login>>) {
    return Object.fromEntries(response.cookies.map((cookie) => [cookie.name, cookie]));
  }

  it('logs in with correct credentials and starts a session bound to the user', async () => {
    const response = await login(CREDENTIALS);

    expect(response.statusCode).toBe(200);
    const { user } = authResponseSchema.parse(response.json());
    expect(user).toEqual(registered.user);

    const cookies = cookiesByName(response);
    const access = cookies[ACCESS_TOKEN_COOKIE_NAME];
    const csrf = cookies[CSRF_COOKIE_NAME];

    expect(access).toBeDefined();
    expect(access!.httpOnly).toBe(true);
    expect(access!.secure).toBe(true);
    expect(access!.sameSite).toBe('Lax');
    expect(access!.path).toBe('/');
    expect(access!.maxAge).toBe(86400);

    expect(csrf).toBeDefined();
    expect(csrf!.httpOnly).toBeFalsy();
    expect(csrf!.secure).toBe(true);
    expect(csrf!.sameSite).toBe('Lax');
    expect(csrf!.path).toBe('/');
    expect(csrf!.maxAge).toBe(86400);

    const claims = app.jwt.verify<SessionClaims>(access!.value);
    expect(claims.sub).toBe(user.id);
    expect(claims.csrf).toBe(csrf!.value);
  });

  it('logs in a user created the way prisma/seed.ts creates one', async () => {
    await app.prisma.user.create({
      data: {
        email: 'seeded@demo.dev',
        name: 'Seeded',
        role: 'DISPATCHER',
        passwordHash: await hashPassword('dispatcher123'),
      },
    });

    const response = await login({ email: 'seeded@demo.dev', password: 'dispatcher123' });

    expect(response.statusCode).toBe(200);
    expect(authResponseSchema.parse(response.json()).user.role).toBe('DISPATCHER');
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS and no cookies', async () => {
    const response = await login({ ...CREDENTIALS, password: 'wrong-password' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(INVALID);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an unknown email with the same 401 INVALID_CREDENTIALS and no cookies', async () => {
    const response = await login({ ...CREDENTIALS, email: 'nobody@example.com' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(INVALID);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('answers a wrong password and an unknown email with byte-identical responses', async () => {
    const wrongPassword = await login({ ...CREDENTIALS, password: 'wrong-password' });
    const unknownEmail = await login({ ...CREDENTIALS, email: 'nobody@example.com' });

    expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownEmail.body).toBe(wrongPassword.body);
    expect(unknownEmail.headers['content-type']).toBe(wrongPassword.headers['content-type']);
  });

  it('normalizes the email before looking the user up', async () => {
    const response = await login({ ...CREDENTIALS, email: '  CLIENT@Example.com ' });

    expect(response.statusCode).toBe(200);
  });

  it('does not trim the password', async () => {
    const response = await login({ ...CREDENTIALS, password: ' password123 ' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a missing password with a validation error', async () => {
    const response = await login({ email: CREDENTIALS.email });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { code: string; details: Array<{ path: string }> } }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((detail) => detail.path)).toContain('password');
  });

  it('rejects malformed JSON with 400 BAD_REQUEST in the error envelope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('BAD_REQUEST');
  });

  it('treats a corrupt stored password hash as invalid credentials, not a server error', async () => {
    await app.prisma.user.create({
      data: { email: 'corrupt@example.com', name: 'Corrupt', role: 'CLIENT', passwordHash: 'garbage' },
    });

    const response = await login({ email: 'corrupt@example.com', password: 'password123' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(INVALID);
  });

  it('issues a fresh CSRF token on every login, each bound to its own access token', async () => {
    const first = cookiesByName(await login(CREDENTIALS));
    const second = cookiesByName(await login(CREDENTIALS));

    expect(first[CSRF_COOKIE_NAME]!.value).not.toBe(second[CSRF_COOKIE_NAME]!.value);
    for (const cookies of [first, second]) {
      const claims = app.jwt.verify<SessionClaims>(cookies[ACCESS_TOKEN_COOKIE_NAME]!.value);
      expect(claims.csrf).toBe(cookies[CSRF_COOKIE_NAME]!.value);
    }
  });

  it('does not require a CSRF header even when stale session cookies are attached', async () => {
    const response = await app.inject({
      method: 'POST',
      url: URL,
      cookies: registered.cookies,
      payload: CREDENTIALS,
    });

    expect(response.statusCode).toBe(200);
  });
});
