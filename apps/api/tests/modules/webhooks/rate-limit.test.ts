import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Shipment } from '@prisma/client';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';
import { postWebhook, type PostWebhookOptions } from '../../helpers/webhooks.js';

const TRACKING_NUMBER = 'ST-TEST-RL';
const LOGIN_URL = '/api/v1/auth/login';
const UNKNOWN_CREDENTIALS = { email: 'nobody@example.com', password: 'password123' };
const RATE_LIMITED = { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } };

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const iso = (date: Date) => date.toISOString();

describe('rate limiting on POST /webhooks/carrier', () => {
  let app: FastifyInstance;
  let shipment: Shipment;

  beforeEach(async () => {
    // The in-memory counters live on the app instance, so each test gets a fresh one.
    app = await buildTestApp({
      config: {
        webhookRateLimit: { max: 3, timeWindowMs: 60_000 },
        authRateLimit: { max: 2, timeWindowMs: 60_000 },
      },
    });
    await resetDb(app.prisma);
    const client = await registerTestUser(app);
    shipment = await createTestShipment(app.prisma, client.user.id, { trackingNumber: TRACKING_NUMBER });
  });

  afterEach(async () => {
    await app.close();
  });

  /** `CREATED → CREATED` is a legal self-loop, so every distinct timestamp is a `201`. */
  function hook(minutesAgo: number, options: PostWebhookOptions = {}) {
    return postWebhook(
      app,
      { trackingNumber: TRACKING_NUMBER, status: 'CREATED', occurredAt: iso(ago(minutesAgo)) },
      options,
    );
  }

  function eventCount() {
    return app.prisma.movementEvent.count({ where: { shipmentId: shipment.id } });
  }

  async function exhaustLimit() {
    for (const minutesAgo of [30, 20, 10]) {
      const response = await hook(minutesAgo);
      expect(response.statusCode, `hook(${minutesAgo})`).toBe(201);
    }
  }

  function login() {
    return app.inject({ method: 'POST', url: LOGIN_URL, payload: UNKNOWN_CREDENTIALS });
  }

  it('lets three requests through and rejects the fourth with 429 RATE_LIMITED, storing nothing', async () => {
    await exhaustLimit();
    const countBefore = await eventCount();

    const response = await hook(5);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual(RATE_LIMITED);
    expect(response.headers['retry-after']).toBeDefined();
    expect(await eventCount()).toBe(countBefore);
  });

  it('counts rejected requests too', async () => {
    const statusCodes: number[] = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      statusCodes.push((await hook(30 - attempt, { signature: null })).statusCode);
    }
    statusCodes.push((await hook(5)).statusCode);

    expect(statusCodes).toEqual([401, 401, 401, 429]);
  });

  it('checks the limit before the signature', async () => {
    await exhaustLimit();

    const response = await hook(5, { signature: null });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual(RATE_LIMITED);
  });

  it('checks the limit before the body is read', async () => {
    await exhaustLimit();

    const response = await postWebhook(app, 'x', { contentType: 'text/plain' });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual(RATE_LIMITED);
  });

  it('keeps a counter separate from login (webhook exhausted)', async () => {
    await exhaustLimit();

    const response = await login();

    expect(response.statusCode).toBe(401);
  });

  it('keeps a counter separate from login (login exhausted)', async () => {
    const loginCodes: number[] = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      loginCodes.push((await login()).statusCode);
    }
    expect(loginCodes).toEqual([401, 401, 429]);

    const response = await hook(5);

    expect(response.statusCode).toBe(201);
  });

  it('does not rate limit /health', async () => {
    const statusCodes: number[] = [];
    for (let attempt = 1; attempt <= 10; attempt++) {
      statusCodes.push((await app.inject({ method: 'GET', url: '/health' })).statusCode);
    }

    expect(statusCodes).toEqual(Array(10).fill(200));
  });
});
