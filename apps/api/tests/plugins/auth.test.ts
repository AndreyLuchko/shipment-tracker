import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SessionClaims } from '../../src/plugins/auth.js';
import { buildTestApp } from '../helpers/app.js';
import { sessionRoute, startSession } from '../helpers/session.js';

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };

function testRoutes(app: FastifyInstance): void {
  sessionRoute(app);
  app.get('/__test/protected', { onRequest: [app.authenticate] }, async (request) => request.user);
  app.get('/__test/dispatcher-only', { onRequest: [app.authenticate, app.requireRole('DISPATCHER')] }, async () => ({
    ok: true,
  }));
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('auth plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp({ routes: testRoutes });
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('issueSession', () => {
    it('sets access_token as an HttpOnly, Secure, Lax, host-only cookie for 24 h', async () => {
      const { access } = await startSession(app);

      expect(access.httpOnly).toBe(true);
      expect(access.secure).toBe(true);
      expect(access.sameSite).toBe('Lax');
      expect(access.path).toBe('/');
      expect(access.maxAge).toBe(86400);
      expect(access.domain).toBeUndefined();
    });

    it('sets csrf_token as a readable, Secure, Lax, host-only cookie for 24 h', async () => {
      const { csrf } = await startSession(app);

      expect(csrf.httpOnly).toBeFalsy();
      expect(csrf.secure).toBe(true);
      expect(csrf.sameSite).toBe('Lax');
      expect(csrf.path).toBe('/');
      expect(csrf.maxAge).toBe(86400);
      expect(csrf.domain).toBeUndefined();
    });

    it('binds the CSRF cookie value to the csrf claim of the JWT', async () => {
      const { access, csrf } = await startSession(app);

      expect(csrf.value.length).toBeGreaterThanOrEqual(43);
      expect(app.jwt.decode<SessionClaims>(access.value)!.csrf).toBe(csrf.value);
    });

    it('signs sub and role into a JWT that lives 24 h', async () => {
      const { access } = await startSession(app);

      const claims = app.jwt.decode<SessionClaims & { iat: number; exp: number }>(access.value)!;
      expect(claims.sub).toBe('user_1');
      expect(claims.role).toBe('CLIENT');
      expect(claims.exp - claims.iat).toBe(86400);
    });

    it('generates a fresh CSRF token per session', async () => {
      const first = await startSession(app);
      const second = await startSession(app);

      expect(first.csrf.value).not.toBe(second.csrf.value);
    });

    it('omits Secure on both cookies when cookieSecure is false', async () => {
      const insecureApp = await buildTestApp({ config: { cookieSecure: false }, routes: testRoutes });
      try {
        const { access, csrf } = await startSession(insecureApp);

        expect(access.secure).toBeFalsy();
        expect(csrf.secure).toBeFalsy();
      } finally {
        await insecureApp.close();
      }
    });
  });

  describe('authenticate', () => {
    it('rejects a request without cookies', async () => {
      const response = await app.inject({ method: 'GET', url: '/__test/protected' });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual(UNAUTHORIZED);
    });

    it('rejects a token that is not a JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/__test/protected',
        cookies: { access_token: 'not-a-jwt' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual(UNAUTHORIZED);
    });

    it('rejects a token signed with a different secret', async () => {
      const foreignApp = await buildTestApp({
        config: { jwtSecret: 'another-secret-0123456789abcdefghij' },
        routes: testRoutes,
      });
      try {
        const { cookies } = await startSession(foreignApp, 'DISPATCHER');

        const response = await app.inject({ method: 'GET', url: '/__test/protected', cookies });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toStrictEqual(UNAUTHORIZED);
      } finally {
        await foreignApp.close();
      }
    });

    it('rejects an unsigned alg:none token', async () => {
      const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: 'user_1', role: 'DISPATCHER', csrf: 'x' })}.`;

      const response = await app.inject({ method: 'GET', url: '/__test/protected', cookies: { access_token: token } });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual(UNAUTHORIZED);
    });

    it('rejects a validly signed token with incomplete claims', async () => {
      const token = app.jwt.sign({ sub: 'user_1' } as unknown as SessionClaims);

      const response = await app.inject({ method: 'GET', url: '/__test/protected', cookies: { access_token: token } });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual(UNAUTHORIZED);
    });

    it('ignores a valid token sent in the Authorization header', async () => {
      const { cookies } = await startSession(app);

      const response = await app.inject({
        method: 'GET',
        url: '/__test/protected',
        headers: { authorization: `Bearer ${cookies.access_token}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual(UNAUTHORIZED);
    });

    it('accepts valid session cookies and exposes the claims as request.user', async () => {
      const { cookies } = await startSession(app);

      const response = await app.inject({ method: 'GET', url: '/__test/protected', cookies });

      expect(response.statusCode).toBe(200);
      const body = response.json<SessionClaims>();
      expect(body.sub).toBe('user_1');
      expect(body.role).toBe('CLIENT');
    });

    it('rejects an expired token', async () => {
      const { cookies } = await startSession(app);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 86_401_000);

      const response = await app.inject({ method: 'GET', url: '/__test/protected', cookies });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual(UNAUTHORIZED);
    });
  });

  describe('requireRole', () => {
    it('rejects an anonymous request with 401', async () => {
      const response = await app.inject({ method: 'GET', url: '/__test/dispatcher-only' });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toStrictEqual(UNAUTHORIZED);
    });

    it('rejects a CLIENT session with 403', async () => {
      const { cookies } = await startSession(app, 'CLIENT');

      const response = await app.inject({ method: 'GET', url: '/__test/dispatcher-only', cookies });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toStrictEqual({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    });

    it('lets a DISPATCHER session through', async () => {
      const { cookies } = await startSession(app, 'DISPATCHER');

      const response = await app.inject({ method: 'GET', url: '/__test/dispatcher-only', cookies });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ ok: true });
    });
  });
});
