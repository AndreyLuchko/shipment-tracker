import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildTestApp } from '../../helpers/app.js';
import { resetDb } from '../../helpers/db.js';
import { WEBHOOK_URL } from '../../helpers/webhooks.js';

const LOGIN_URL = '/api/v1/auth/login';
const UNKNOWN_CREDENTIALS = { email: 'nobody@example.com', password: 'password123' };
const SOCKET_ADDRESS = '10.0.0.1';
const VISITOR_A = '203.0.113.7';
const VISITOR_B = '198.51.100.9';

describe('TRUST_PROXY and the client IP', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function build(trustProxy: boolean): Promise<FastifyInstance> {
    const built = await buildTestApp({
      config: {
        trustProxy,
        authRateLimit: { max: 2, timeWindowMs: 60_000 },
        webhookRateLimit: { max: 1, timeWindowMs: 60_000 },
      },
      routes: (instance) => {
        instance.get('/ip', async (request) => ({ ip: request.ip }));
      },
    });
    app = built;
    await resetDb(built.prisma);
    return built;
  }

  function get(instance: FastifyInstance, forwardedFor?: string) {
    return instance.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: SOCKET_ADDRESS,
      ...(forwardedFor !== undefined ? { headers: { 'x-forwarded-for': forwardedFor } } : {}),
    });
  }

  function login(instance: FastifyInstance, visitor: string) {
    return instance.inject({
      method: 'POST',
      url: LOGIN_URL,
      payload: UNKNOWN_CREDENTIALS,
      remoteAddress: SOCKET_ADDRESS,
      headers: { 'x-forwarded-for': visitor },
    });
  }

  function webhook(instance: FastifyInstance, visitor: string) {
    return instance.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      payload: '{}',
      remoteAddress: SOCKET_ADDRESS,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': visitor },
    });
  }

  function statuses(responses: LightMyRequestResponse[]): number[] {
    return responses.map((response) => response.statusCode);
  }

  it('takes request.ip from the first X-Forwarded-For entry when trustProxy is true', async () => {
    const instance = await build(true);

    const response = await get(instance, `${VISITOR_A}, 10.9.9.9`);

    expect(response.json()).toEqual({ ip: VISITOR_A });
  });

  it('falls back to the socket address when trustProxy is true and the header is absent', async () => {
    const instance = await build(true);

    const response = await get(instance);

    expect(response.json()).toEqual({ ip: SOCKET_ADDRESS });
  });

  it('ignores X-Forwarded-For when trustProxy is false', async () => {
    const instance = await build(false);

    const response = await get(instance, VISITOR_A);

    expect(response.json()).toEqual({ ip: SOCKET_ADDRESS });
  });

  it('gives each visitor their own login bucket when trustProxy is true', async () => {
    const instance = await build(true);

    const first = await login(instance, VISITOR_A);
    const second = await login(instance, VISITOR_A);
    const third = await login(instance, VISITOR_A);
    const other = await login(instance, VISITOR_B);

    expect(statuses([first, second, third])).toEqual([401, 401, 429]);
    expect(third.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(third.headers['retry-after']).toBeDefined();
    expect(other.statusCode).toBe(401);
  });

  it('shares one login bucket between all visitors when trustProxy is false', async () => {
    const instance = await build(false);

    const responses = [
      await login(instance, VISITOR_A),
      await login(instance, VISITOR_A),
      await login(instance, VISITOR_B),
    ];

    expect(statuses(responses)).toEqual([401, 401, 429]);
  });

  it('gives each visitor their own webhook bucket when trustProxy is true', async () => {
    const instance = await build(true);

    const first = await webhook(instance, VISITOR_A);
    const second = await webhook(instance, VISITOR_A);
    const other = await webhook(instance, VISITOR_B);

    expect(first.statusCode).toBe(401);
    expect(first.json()).toMatchObject({ error: { code: 'INVALID_SIGNATURE' } });
    expect(second.statusCode).toBe(429);
    expect(other.statusCode).toBe(401);
  });
});
