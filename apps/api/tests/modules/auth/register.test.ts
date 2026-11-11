import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME, authResponseSchema } from '@shipment-tracker/shared';
import { verifyPassword } from '../../../src/lib/password.js';
import type { SessionClaims } from '../../../src/plugins/auth.js';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';

const URL = '/api/v1/auth/register';
const BASE = { email: 'new.client@example.com', password: 'password123', name: 'New Client' };

describe('POST /api/v1/auth/register', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  function register(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: URL, payload });
  }

  function cookiesByName(response: Awaited<ReturnType<typeof register>>) {
    return Object.fromEntries(response.cookies.map((cookie) => [cookie.name, cookie]));
  }

  it('creates a CLIENT user and returns the public user without the password hash', async () => {
    const response = await register(BASE);

    expect(response.statusCode).toBe(201);
    const { user } = authResponseSchema.parse(response.json());
    expect(user.email).toBe('new.client@example.com');
    expect(user.name).toBe('New Client');
    expect(user.role).toBe('CLIENT');
    expect(response.body).not.toContain('passwordHash');
  });

  it('stores a scrypt hash of the password, not the password itself', async () => {
    await register(BASE);

    const row = await app.prisma.user.findUnique({ where: { email: BASE.email } });
    expect(row).not.toBeNull();
    expect(row!.passwordHash).not.toBe('password123');
    expect(await verifyPassword('password123', row!.passwordHash)).toBe(true);
  });

  it('starts a session: sets the access_token and csrf_token cookies', async () => {
    const response = await register(BASE);
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
  });

  it('binds the session claims to the new user and the CSRF cookie', async () => {
    const response = await register(BASE);
    const { user } = authResponseSchema.parse(response.json());
    const cookies = cookiesByName(response);

    const claims = app.jwt.verify<SessionClaims>(cookies[ACCESS_TOKEN_COOKIE_NAME]!.value);
    expect(claims.sub).toBe(user.id);
    expect(claims.role).toBe('CLIENT');
    expect(claims.csrf).toBe(cookies[CSRF_COOKIE_NAME]!.value);
  });

  it('accepts role DISPATCHER', async () => {
    const response = await register({ ...BASE, role: 'DISPATCHER' });

    expect(response.statusCode).toBe(201);
    expect(authResponseSchema.parse(response.json()).user.role).toBe('DISPATCHER');
  });

  it('rejects role ADMIN with a validation error and creates nothing', async () => {
    const response = await register({ ...BASE, role: 'ADMIN' });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { code: string; details: Array<{ path: string }> } }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((detail) => detail.path)).toContain('role');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await app.prisma.user.count()).toBe(0);
  });

  it('rejects an invalid body with a validation error and no cookies', async () => {
    const response = await register({ email: 'bad' });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('normalizes the email: trims and lowercases it', async () => {
    const response = await register({ ...BASE, email: '  MiXed@Example.com ' });

    expect(response.statusCode).toBe(201);
    expect(authResponseSchema.parse(response.json()).user.email).toBe('mixed@example.com');
  });

  it('rejects the same email in a different case with 409 EMAIL_TAKEN and no cookies', async () => {
    expect((await register(BASE)).statusCode).toBe(201);

    const response = await register({ ...BASE, email: 'New.Client@Example.COM' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'EMAIL_TAKEN', message: 'Email is already registered' } });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('lets exactly one of two simultaneous registrations with the same email succeed', async () => {
    const responses = await Promise.all([register(BASE), register(BASE)]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(await app.prisma.user.count({ where: { email: BASE.email } })).toBe(1);
  });

  it('ignores client-supplied id, passwordHash and createdAt', async () => {
    const response = await register({
      ...BASE,
      id: 'forced-id',
      passwordHash: 'x',
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(201);
    const { user } = authResponseSchema.parse(response.json());
    expect(user.id).not.toBe('forced-id');
    const row = await app.prisma.user.findUnique({ where: { id: user.id } });
    expect(row!.passwordHash).not.toBe('x');
    // Absolute difference: the timestamp comes from Postgres' clock, which may drift slightly from Node's.
    expect(Math.abs(Date.now() - new Date(user.createdAt).getTime())).toBeLessThan(60_000);
  });

  it('rejects a password longer than 128 characters', async () => {
    const response = await register({ ...BASE, password: 'x'.repeat(129) });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });

  it('registerTestUser helper registers a user and returns its session', async () => {
    const session = await registerTestUser(app, { role: 'DISPATCHER' });

    expect(session.user.role).toBe('DISPATCHER');
    expect(session.user.email).toMatch(/^user-.+@example\.com$/);
    expect(session.cookies.access_token).not.toBe('');
    expect(session.csrfToken).toBe(session.cookies.csrf_token);
  });
});
