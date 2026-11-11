import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';

const ME_URL = '/api/v1/auth/me';
const LOGOUT_URL = '/api/v1/auth/logout';
const UNAUTH = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };

describe('auth session endpoints', () => {
  let app: FastifyInstance;
  let session: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    session = await registerTestUser(app);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
  });

  function me(cookies?: Record<string, string>) {
    return app.inject({ method: 'GET', url: ME_URL, ...(cookies ? { cookies } : {}) });
  }

  describe('GET /api/v1/auth/me', () => {
    it('rejects a request without cookies', async () => {
      const response = await me();

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
    });

    it('returns the current user for a valid session without a CSRF header', async () => {
      const response = await me(session.cookies);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ user: session.user });
      expect(response.body).not.toContain('passwordHash');
    });

    it('rejects a live token whose user row has been deleted', async () => {
      await app.prisma.user.delete({ where: { id: session.user.id } });

      const response = await me(session.cookies);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
    });

    it('rejects an expired token', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 86_401_000);

      const response = await me(session.cookies);

      expect(response.statusCode).toBe(401);
    });

    it('rejects a token whose payload was altered (role escalated) under the original signature', async () => {
      // Tamper the claims, not a signature character: the last base64url character of an HS256 signature
      // carries 2 unused bits, so swapping it (e.g. 'A' -> 'B') can decode to the same bytes and still verify.
      const [header, payload, signature] = session.cookies.access_token.split('.');
      const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>;
      expect(claims['role']).toBe('CLIENT');
      const escalated = Buffer.from(JSON.stringify({ ...claims, role: 'DISPATCHER' })).toString('base64url');
      const tampered = `${header}.${escalated}.${signature}`;

      const response = await me({ ...session.cookies, access_token: tampered });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('rejects a request without cookies', async () => {
      const response = await app.inject({ method: 'POST', url: LOGOUT_URL });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
    });

    it('rejects a logout without the CSRF header and leaves the session intact', async () => {
      const response = await app.inject({ method: 'POST', url: LOGOUT_URL, cookies: session.cookies });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('CSRF_TOKEN_INVALID');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect((await me(session.cookies)).statusCode).toBe(200);
    });

    it('logs out with the CSRF header: 204, empty body, both cookies cleared', async () => {
      const response = await app.inject({
        method: 'POST',
        url: LOGOUT_URL,
        cookies: session.cookies,
        headers: { 'x-csrf-token': session.csrfToken },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      for (const name of [ACCESS_TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME]) {
        const cookie = response.cookies.find((c) => c.name === name);
        expect(cookie, name).toBeDefined();
        expect(cookie?.value).toBe('');
        expect(cookie?.path).toBe('/');
        const cleared =
          cookie?.maxAge === 0 || (cookie?.expires !== undefined && cookie.expires.getTime() < Date.now());
        expect(cleared, `${name} is expired`).toBe(true);
      }
    });

    it('a request without cookies after logout is unauthenticated', async () => {
      const logout = await app.inject({
        method: 'POST',
        url: LOGOUT_URL,
        cookies: session.cookies,
        headers: { 'x-csrf-token': session.csrfToken },
      });
      expect(logout.statusCode).toBe(204);

      const response = await me();

      expect(response.statusCode).toBe(401);
    });
  });
});
