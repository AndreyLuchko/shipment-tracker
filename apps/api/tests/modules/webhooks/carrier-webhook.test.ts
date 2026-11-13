import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Shipment } from '@prisma/client';
import {
  carrierWebhookResponseSchema,
  errorResponseSchema,
  shipmentResponseSchema,
  type CarrierWebhookResponse,
} from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';
import { WEBHOOK_URL, postWebhook, signBody } from '../../helpers/webhooks.js';

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

const INVALID_SIG = { error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } };
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Shipment not found' } };
const NOT_JSON = { error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } };

const ACK = (trackingNumber: string, shipmentStatus: string, duplicate: boolean) => ({
  trackingNumber,
  shipmentStatus,
  duplicate,
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const iso = (date: Date) => date.toISOString();

let app: FastifyInstance;
let owner: TestSession;
let shipment: Shipment;
let secret: string;
let X: string;

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { trackingNumber: 'ST-TEST-HOOK', status: 'PICKED_UP', location: 'Kyiv depot', occurredAt: X, ...overrides };
}

async function snapshot(id: string) {
  const row = await app.prisma.shipment.findUniqueOrThrow({
    where: { id },
    select: { status: true, updatedAt: true, _count: { select: { events: true } } },
  });
  return { status: row.status, updatedAt: row.updatedAt, eventCount: row._count.events };
}

function events(): Promise<number> {
  return app.prisma.movementEvent.count();
}

function lastStoredEvent(shipmentId: string) {
  return app.prisma.movementEvent.findFirstOrThrow({
    where: { shipmentId },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  });
}

function expectValidationErrorOn(response: { statusCode: number; json: () => unknown }, path: string): void {
  expect(response.statusCode).toBe(400);
  const body = response.json() as ErrorBody;
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toBe('Request validation failed');
  expect(body.error.details?.map((detail) => detail.path)).toContain(path);
}

beforeAll(async () => {
  app = await buildTestApp({
    routes: (instance) => {
      instance.post('/__test/echo', async (request) => ({
        isBuffer: Buffer.isBuffer(request.body),
        body: request.body,
      }));
    },
  });
  secret = app.config.webhookSecret;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb(app.prisma);
  owner = await registerTestUser(app, { name: 'Olena Client' });
  shipment = await createTestShipment(app.prisma, owner.user.id, { trackingNumber: 'ST-TEST-HOOK' });
  X = iso(ago(60));
});

describe('POST /api/v1/webhooks/carrier — happy path', () => {
  it('stores a validly signed event and acknowledges it with 201', async () => {
    const before = await snapshot(shipment.id);

    const response = await postWebhook(app, event());

    expect(response.statusCode).toBe(201);
    const body: CarrierWebhookResponse = carrierWebhookResponseSchema.parse(response.json());
    expect(body).toEqual(ACK('ST-TEST-HOOK', 'PICKED_UP', false));

    const stored = await lastStoredEvent(shipment.id);
    expect(stored).toMatchObject({ status: 'PICKED_UP', source: 'WEBHOOK', location: 'Kyiv depot', note: null });
    expect(stored.occurredAt.toISOString()).toBe(X);

    const after = await snapshot(shipment.id);
    expect(after.status).toBe('PICKED_UP');
    expect(after.eventCount).toBe(before.eventCount + 1);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('answers with the acknowledgement only — no client data', async () => {
    const response = await postWebhook(app, event());

    expect(response.statusCode).toBe(201);
    expect(Object.keys(response.json() as object).sort()).toEqual(['duplicate', 'shipmentStatus', 'trackingNumber']);
    expect(response.body).not.toContain(owner.user.email);
    expect(response.body).not.toContain('Olena Client');
  });

  it('stores a trimmed note', async () => {
    const response = await postWebhook(app, event({ note: ' Left at reception ' }));

    expect(response.statusCode).toBe(201);
    expect((await lastStoredEvent(shipment.id)).note).toBe('Left at reception');
  });

  it('stores a non-ASCII location as is', async () => {
    const response = await postWebhook(app, event({ location: 'Київ, сортувальний центр' }));

    expect(response.statusCode).toBe(201);
    expect((await lastStoredEvent(shipment.id)).location).toBe('Київ, сортувальний центр');
  });

  it('accepts an event without a location', async () => {
    const payload = event();
    delete payload.location;

    const response = await postWebhook(app, payload);

    expect(response.statusCode).toBe(201);
    expect((await lastStoredEvent(shipment.id)).location).toBeNull();
  });

  it('trims the tracking number before the lookup', async () => {
    const response = await postWebhook(app, event({ trackingNumber: ' ST-TEST-HOOK ' }));

    expect(response.statusCode).toBe(201);
  });

  it('accepts any formatting that is signed as sent', async () => {
    const response = await postWebhook(app, JSON.stringify(event(), null, 2));

    expect(response.statusCode).toBe(201);
  });

  it('accepts a charset parameter on the content type', async () => {
    const response = await postWebhook(app, event(), { contentType: 'application/json; charset=utf-8' });

    expect(response.statusCode).toBe(201);
  });

  it('shows the carrier event on the shipment detail', async () => {
    expect((await postWebhook(app, event())).statusCode).toBe(201);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/shipments/${shipment.id}`,
      cookies: owner.cookies,
    });

    expect(response.statusCode).toBe(200);
    const { shipment: detail } = shipmentResponseSchema.parse(response.json());
    expect(detail.status).toBe('PICKED_UP');
    expect(detail.events.at(-1)).toMatchObject({ source: 'WEBHOOK', status: 'PICKED_UP' });
  });
});

describe('POST /api/v1/webhooks/carrier — signature', () => {
  async function expectRejected(send: () => Promise<{ statusCode: number; json: () => unknown; body: string }>) {
    const before = await snapshot(shipment.id);
    const count = await events();

    const response = await send();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(INVALID_SIG);
    expect(await snapshot(shipment.id)).toEqual(before);
    expect(await events()).toBe(count);
    return response;
  }

  it('rejects a request without a signature header', async () => {
    await expectRejected(() => postWebhook(app, event(), { signature: null }));
  });

  it('rejects a request signed with another secret', async () => {
    await expectRejected(() => postWebhook(app, event(), { secret: 'x'.repeat(32) }));
  });

  it('rejects the signature of another body', async () => {
    const signature = signBody(JSON.stringify(event({ status: 'DELIVERED' })), secret);
    await expectRejected(() => postWebhook(app, event(), { signature }));
  });

  it('rejects the same JSON in other bytes', async () => {
    const signature = signBody(JSON.stringify(event()), secret);
    await expectRejected(() => postWebhook(app, JSON.stringify(event(), null, 2), { signature }));
  });

  const malformed: Array<[string, (hex: string) => string]> = [
    ['the bare hex without sha256=', (hex) => hex],
    ['63 hex digits', (hex) => `sha256=${hex.slice(0, 63)}`],
    ['64 non-hex characters', () => `sha256=${'z'.repeat(64)}`],
    ['an upper-case prefix', (hex) => `SHA256=${hex}`],
    ['another algorithm prefix', (hex) => `sha1=${hex}`],
    ['an empty value', () => ''],
  ];

  it.each(malformed)('rejects a malformed signature: %s', async (_name, build) => {
    const body = JSON.stringify(event());
    const hex = signBody(body, secret).slice('sha256='.length);
    await expectRejected(() => postWebhook(app, body, { signature: build(hex) }));
  });

  it('rejects a signature header sent twice', async () => {
    const body = JSON.stringify(event());
    const valid = signBody(body, secret);
    await expectRejected(() => postWebhook(app, body, { signature: [valid, valid] }));
  });

  it('accepts upper-case hex digits', async () => {
    const body = JSON.stringify(event());
    const hex = signBody(body, secret).slice('sha256='.length);

    const response = await postWebhook(app, body, { signature: `sha256=${hex.toUpperCase()}` });

    expect(response.statusCode).toBe(201);
  });

  it('answers a missing, a wrong and a malformed signature with the same bytes', async () => {
    const body = JSON.stringify(event());
    const hex = signBody(body, secret).slice('sha256='.length);

    const missing = await postWebhook(app, body, { signature: null });
    const wrong = await postWebhook(app, body, { secret: 'x'.repeat(32) });
    const bare = await postWebhook(app, body, { signature: hex });

    expect(missing.body).toBe(wrong.body);
    expect(missing.body).toBe(bare.body);
  });

  it('checks the signature before the lookup', async () => {
    const response = await postWebhook(app, event({ trackingNumber: 'ST-NOPE' }), { secret: 'x'.repeat(32) });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(INVALID_SIG);
  });
});

describe('POST /api/v1/webhooks/carrier — transport', () => {
  async function expectEnvelopeAndNoTrace(send: () => Promise<{ statusCode: number; json: () => unknown }>) {
    const before = await snapshot(shipment.id);

    const response = await send();

    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(await snapshot(shipment.id)).toEqual(before);
    return response;
  }

  it('answers malformed JSON that is validly signed with 400', async () => {
    const response = await expectEnvelopeAndNoTrace(() => postWebhook(app, '{"trackingNumber":'));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(NOT_JSON);
  });

  it('checks the signature before parsing the JSON', async () => {
    const response = await expectEnvelopeAndNoTrace(() =>
      postWebhook(app, '{"trackingNumber":', { signature: `sha256=${'0'.repeat(64)}` }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(INVALID_SIG);
  });

  it.each([
    ['an empty body', ''],
    ['no body', undefined],
  ])('answers %s that is validly signed with 400', async (_name, body) => {
    const response = await expectEnvelopeAndNoTrace(() => postWebhook(app, body));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(NOT_JSON);
  });

  it('answers a request with nothing at all with 401', async () => {
    const response = await expectEnvelopeAndNoTrace(() =>
      postWebhook(app, undefined, { contentType: null, signature: null }),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(INVALID_SIG);
  });

  it.each(['[]', 'null', '"text"'])('answers JSON that is not an object (%s) with VALIDATION_ERROR', async (body) => {
    const response = await expectEnvelopeAndNoTrace(() => postWebhook(app, body));

    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('answers a wrong content type with 415', async () => {
    const response = await expectEnvelopeAndNoTrace(() =>
      postWebhook(app, JSON.stringify(event()), { contentType: 'text/plain' }),
    );

    expect(response.statusCode).toBe(415);
    expect((response.json() as ErrorBody).error.code).toBe('BAD_REQUEST');
  });

  it('answers a wrong content type with 415 even without a signature', async () => {
    const response = await expectEnvelopeAndNoTrace(() =>
      postWebhook(app, JSON.stringify(event()), { contentType: 'text/plain', signature: null }),
    );

    expect(response.statusCode).toBe(415);
  });

  it('answers a body over the limit with 413', async () => {
    const response = await expectEnvelopeAndNoTrace(() => postWebhook(app, event({ note: 'x'.repeat(17_000) })));

    expect(response.statusCode).toBe(413);
    expect((response.json() as ErrorBody).error.code).toBe('BAD_REQUEST');
  });

  it('validates a field that is too long but under the body limit', async () => {
    const response = await expectEnvelopeAndNoTrace(() => postWebhook(app, event({ note: 'x'.repeat(15_000) })));

    expectValidationErrorOn(response, 'note');
  });

  it('has no GET route', async () => {
    const response = await app.inject({ method: 'GET', url: WEBHOOK_URL });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
});

describe('the raw-body parser stays inside the webhook plugin', () => {
  it('leaves JSON parsing in place for other routes', async () => {
    const response = await app.inject({ method: 'POST', url: '/__test/echo', payload: { a: 1 } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ isBuffer: false, body: { a: 1 } });
  });

  it('still parses the login body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'password123' },
    });

    expect(response.statusCode).toBe(401);
    expect((response.json() as ErrorBody).error.code).toBe('INVALID_CREDENTIALS');
  });

  it("keeps Fastify's answer to malformed JSON on other routes", async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as ErrorBody;
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).not.toBe('Request body is not valid JSON');
  });

  it('keeps the default text parser on other routes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'text/plain' },
      payload: 'hello',
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/webhooks/carrier — lookup and carrier scope', () => {
  it('answers an unknown tracking number with 404', async () => {
    const count = await events();

    const response = await postWebhook(app, event({ trackingNumber: 'ST-2026-999999' }));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
    expect(await events()).toBe(count);
  });

  it('matches the tracking number case-sensitively', async () => {
    const response = await postWebhook(app, event({ trackingNumber: 'st-test-hook' }));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
  });

  it("never touches another carrier's shipment", async () => {
    const other = await createTestShipment(app.prisma, owner.user.id, {
      trackingNumber: 'ST-TEST-NP',
      carrier: 'NOVA_POSHTA',
    });
    const before = await snapshot(other.id);

    const response = await postWebhook(app, event({ trackingNumber: 'ST-TEST-NP' }));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
    expect(await snapshot(other.id)).toEqual(before);
  });

  it("answers an unknown number and another carrier's number with the same bytes", async () => {
    await createTestShipment(app.prisma, owner.user.id, { trackingNumber: 'ST-TEST-NP', carrier: 'NOVA_POSHTA' });

    const unknown = await postWebhook(app, event({ trackingNumber: 'ST-2026-999999' }));
    const foreign = await postWebhook(app, event({ trackingNumber: 'ST-TEST-NP' }));

    expect(unknown.body).toBe(foreign.body);
  });

  it('answers a NUL character in the tracking number with VALIDATION_ERROR', async () => {
    const response = await postWebhook(app, event({ trackingNumber: 'a\u0000b' }));

    expectValidationErrorOn(response, 'trackingNumber');
  });
});
