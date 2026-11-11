import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app.js';
import { sessionRoute, startSession } from '../helpers/session.js';

const CSRF_INVALID = { error: { code: 'CSRF_TOKEN_INVALID', message: 'CSRF token missing or invalid' } };

function testRoutes(app: FastifyInstance): void {
  sessionRoute(app);
  app.route({
    method: ['POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/__test/mutate',
    onRequest: [app.authenticate],
    handler: async () => ({ ok: true }),
  });
  app.get('/__test/read', { onRequest: [app.authenticate] }, async () => ({ ok: true }));
}

describe('CSRF verification', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp({ routes: testRoutes });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unsafe request without the CSRF header', async () => {
    const { cookies } = await startSession(app);

    const response = await app.inject({ method: 'POST', url: '/__test/mutate', cookies });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toStrictEqual(CSRF_INVALID);
  });

  it('rejects a header of a different length', async () => {
    const { cookies } = await startSession(app);

    const response = await app.inject({
      method: 'POST',
      url: '/__test/mutate',
      cookies,
      headers: { 'x-csrf-token': 'wrong' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toStrictEqual(CSRF_INVALID);
  });

  it('rejects a same-length header that differs in the last character', async () => {
    const { cookies } = await startSession(app);
    const token = cookies.csrf_token;
    const forged = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');

    const response = await app.inject({
      method: 'POST',
      url: '/__test/mutate',
      cookies,
      headers: { 'x-csrf-token': forged },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toStrictEqual(CSRF_INVALID);
  });

  it('rejects a tossed cookie that matches the header but not the session claim', async () => {
    const { cookies } = await startSession(app);

    const response = await app.inject({
      method: 'POST',
      url: '/__test/mutate',
      cookies: { access_token: cookies.access_token, csrf_token: 'attacker-chosen-value' },
      headers: { 'x-csrf-token': 'attacker-chosen-value' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toStrictEqual(CSRF_INVALID);
  });

  it('rejects a request without the csrf_token cookie even when the header is correct', async () => {
    const { cookies } = await startSession(app);

    const response = await app.inject({
      method: 'POST',
      url: '/__test/mutate',
      cookies: { access_token: cookies.access_token },
      headers: { 'x-csrf-token': cookies.csrf_token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toStrictEqual(CSRF_INVALID);
  });

  it('accepts a POST whose header equals the csrf_token cookie', async () => {
    const { cookies } = await startSession(app);

    const response = await app.inject({
      method: 'POST',
      url: '/__test/mutate',
      cookies,
      headers: { 'x-csrf-token': cookies.csrf_token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ ok: true });
  });

  it.each(['PUT', 'PATCH', 'DELETE'] as const)('rejects %s without the CSRF header', async (method) => {
    const { cookies } = await startSession(app);

    const response = await app.inject({ method, url: '/__test/mutate', cookies });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toStrictEqual(CSRF_INVALID);
  });

  it.each(['PUT', 'PATCH', 'DELETE'] as const)('accepts %s with the correct CSRF header', async (method) => {
    const { cookies } = await startSession(app);

    const response = await app.inject({
      method,
      url: '/__test/mutate',
      cookies,
      headers: { 'x-csrf-token': cookies.csrf_token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ ok: true });
  });

  it('does not require the CSRF header on GET', async () => {
    const { cookies } = await startSession(app);

    const response = await app.inject({ method: 'GET', url: '/__test/read', cookies });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ ok: true });
  });

  it('checks authentication before CSRF', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__test/mutate',
      headers: { 'x-csrf-token': 'anything' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toStrictEqual({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  });

  it('accepts the header in mixed case', async () => {
    const { cookies } = await startSession(app);

    const response = await app.inject({
      method: 'POST',
      url: '/__test/mutate',
      cookies,
      headers: { 'X-CSRF-Token': cookies.csrf_token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ ok: true });
  });
});
