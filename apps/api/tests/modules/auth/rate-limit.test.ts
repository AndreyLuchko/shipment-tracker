import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../helpers/app.js';
import { resetDb } from '../../helpers/db.js';

const LOGIN_URL = '/api/v1/auth/login';
const REGISTER_URL = '/api/v1/auth/register';
const ME_URL = '/api/v1/auth/me';
const UNKNOWN_CREDENTIALS = { email: 'nobody@example.com', password: 'password123' };
const RATE_LIMITED_BODY = { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } };

function registerPayload(index: number) {
  return { email: `client.${index}@example.com`, password: 'password123', name: `Client ${index}` };
}

describe('rate limiting on login and register', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // The in-memory counters live on the app instance, so each test gets a fresh one.
    app = await buildTestApp({ config: { authRateLimit: { max: 5, timeWindowMs: 60_000 } } });
    await resetDb(app.prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  function login() {
    return app.inject({ method: 'POST', url: LOGIN_URL, payload: UNKNOWN_CREDENTIALS });
  }

  function register(index: number) {
    return app.inject({ method: 'POST', url: REGISTER_URL, payload: registerPayload(index) });
  }

  it('lets five failed logins through and rejects the sixth with 429 RATE_LIMITED', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await login();
      expect(response.statusCode, `attempt ${attempt}`).toBe(401);
    }

    const response = await login();

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual(RATE_LIMITED_BODY);
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('keeps a separate counter for register', async () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      await login();
    }

    const response = await register(1);

    expect(response.statusCode).toBe(201);
  });

  it('lets five registrations through and rejects the sixth with 429 RATE_LIMITED', async () => {
    for (let index = 1; index <= 5; index++) {
      const response = await register(index);
      expect(response.statusCode, `registration ${index}`).toBe(201);
    }

    const response = await register(6);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual(RATE_LIMITED_BODY);
  });

  it('does not rate limit /auth/me', async () => {
    const statusCodes: number[] = [];
    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await app.inject({ method: 'GET', url: ME_URL });
      statusCodes.push(response.statusCode);
    }

    expect(statusCodes).toEqual(Array(10).fill(401));
  });
});
