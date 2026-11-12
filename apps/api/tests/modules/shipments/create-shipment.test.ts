import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { shipmentListResponseSchema, shipmentResponseSchema } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';

const UNAUTH = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } };
const CSRF = { error: { code: 'CSRF_TOKEN_INVALID', message: 'CSRF token missing or invalid' } };
const CLIENT_NOT_FOUND = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: [{ path: 'clientId', message: 'Client not found' }],
  },
};

const YEAR = new Date().getUTCFullYear();
const tracking = (sequence: number) => `ST-${YEAR}-${String(sequence).padStart(6, '0')}`;

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

/** Asserts `VALIDATION_ERROR` with a `details` entry on each of `paths`. */
function expectValidationError(response: { statusCode: number; json: () => unknown }, ...paths: string[]) {
  expect(response.statusCode).toBe(400);
  const body = response.json() as ErrorBody;
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toBe('Request validation failed');
  const reported = (body.error.details ?? []).map((detail) => detail.path);
  for (const path of paths) {
    expect(reported).toContain(path);
  }
}

describe('POST /api/v1/shipments', () => {
  let app: FastifyInstance;
  let dispatcher: TestSession;
  let client: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
    client = await registerTestUser(app, { name: 'Demo Client' });
  });

  afterAll(async () => {
    await app.close();
  });

  function base(): Record<string, unknown> {
    return {
      clientId: client.user.id,
      origin: 'Kyiv, UA',
      destination: 'Lviv, UA',
      description: 'Books',
      weightKg: 12.5,
    };
  }

  function create(payload: unknown, session: TestSession = dispatcher) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      ...sessionRequest(session),
      payload: payload as Record<string, unknown>,
    });
  }

  async function createOk(payload: unknown = base()) {
    const response = await create(payload);
    expect(response.statusCode).toBe(201);
    return shipmentResponseSchema.parse(response.json()).shipment;
  }

  describe('access', () => {
    it('rejects a request without cookies', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/shipments', payload: base() });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
      expect(await app.prisma.shipment.count()).toBe(0);
    });

    it('forbids a client', async () => {
      const response = await create(base(), client);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(FORBIDDEN);
      expect(await app.prisma.shipment.count()).toBe(0);
    });

    it('rejects a dispatcher request without the CSRF header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/shipments',
        cookies: dispatcher.cookies,
        payload: base(),
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(CSRF);
      expect(await app.prisma.shipment.count()).toBe(0);
    });
  });

  describe('happy path', () => {
    it('creates a shipment with a generated tracking number', async () => {
      const response = await create(base());
      expect(response.statusCode).toBe(201);
      const { shipment } = shipmentResponseSchema.parse(response.json());
      expect(shipment.trackingNumber).toBe(tracking(1));
      expect(shipment.status).toBe('CREATED');
      expect(shipment.carrier).toBe('SIMULATED');
      expect(shipment.weightKg).toBe(12.5);
      expect(shipment.origin).toBe('Kyiv, UA');
      expect(shipment.destination).toBe('Lviv, UA');
      expect(shipment.description).toBe('Books');
      expect(shipment.client).toEqual({ id: client.user.id, name: 'Demo Client', email: client.user.email });
    });

    it('starts the timeline with one CREATED system event', async () => {
      const shipment = await createOk();
      expect(shipment.events).toHaveLength(1);
      const [event] = shipment.events;
      expect(event).toMatchObject({ status: 'CREATED', source: 'SYSTEM', location: null, note: null });
      const age = Date.now() - Date.parse(event!.occurredAt);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(60_000);
      expect(shipment.allowedNextStatuses).toEqual(['CREATED', 'PICKED_UP', 'EXCEPTION']);
    });

    it('stores one shipment and one event', async () => {
      const shipment = await createOk();
      const rows = await app.prisma.shipment.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('CREATED');
      expect(rows[0]!.clientId).toBe(client.user.id);
      expect(await app.prisma.movementEvent.count({ where: { shipmentId: shipment.id } })).toBe(1);
      expect(await app.prisma.movementEvent.count()).toBe(1);
    });

    it('numbers consecutive creates consecutively', async () => {
      await createOk();
      const second = await createOk();
      expect(second.trackingNumber).toBe(tracking(2));
    });

    it('continues after existing numbers of the year', async () => {
      await createTestShipment(app.prisma, client.user.id, { trackingNumber: tracking(1) });
      await createTestShipment(app.prisma, client.user.id, { trackingNumber: tracking(2) });
      const shipment = await createOk();
      expect(shipment.trackingNumber).toBe(tracking(3));
    });

    it('stores a missing weight as null', async () => {
      const payload = base();
      delete payload.weightKg;
      const shipment = await createOk(payload);
      expect(shipment.weightKg).toBeNull();
    });

    it('trims text fields', async () => {
      const shipment = await createOk({ ...base(), origin: '  Kyiv, UA  ', description: ' Books ' });
      expect(shipment.origin).toBe('Kyiv, UA');
      expect(shipment.description).toBe('Books');
    });

    it('ignores fields the server owns', async () => {
      const shipment = await createOk({
        ...base(),
        id: 'forced',
        trackingNumber: 'ST-HACK',
        status: 'DELIVERED',
        carrier: 'DHL',
        events: [],
        createdAt: '2000-01-01T00:00:00.000Z',
      });
      expect(shipment.id).not.toBe('forced');
      expect(shipment.trackingNumber).toMatch(/^ST-\d{4}-\d{6}$/);
      expect(shipment.status).toBe('CREATED');
      expect(shipment.carrier).toBe('SIMULATED');
      expect(shipment.events).toHaveLength(1);
      const age = Date.now() - Date.parse(shipment.createdAt);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(60_000);
    });

    it('is visible to its client in the detail', async () => {
      const shipment = await createOk();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/shipments/${shipment.id}`,
        ...sessionRequest(client),
      });
      expect(response.statusCode).toBe(200);
      expect(shipmentResponseSchema.parse(response.json()).shipment.trackingNumber).toBe(shipment.trackingNumber);
    });

    it('is visible to its client in the list', async () => {
      await createOk();
      const response = await app.inject({ method: 'GET', url: '/api/v1/shipments', ...sessionRequest(client) });
      expect(response.statusCode).toBe(200);
      expect(shipmentListResponseSchema.parse(response.json()).total).toBe(1);
    });
  });

  describe('validation', () => {
    it('rejects a clientId that does not exist', async () => {
      const response = await create({ ...base(), clientId: 'doesnotexist' });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(CLIENT_NOT_FOUND);
      expect(await app.prisma.shipment.count()).toBe(0);
    });

    it('rejects a clientId that is not a CLIENT', async () => {
      const response = await create({ ...base(), clientId: dispatcher.user.id });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(CLIENT_NOT_FOUND);
      expect(await app.prisma.shipment.count()).toBe(0);
    });

    it('reports every missing required field', async () => {
      const response = await create({});
      expectValidationError(response, 'clientId', 'origin', 'destination', 'description');
    });

    it.each([0, -1, '12', 100001])('rejects weightKg %j', async (weightKg) => {
      const response = await create({ ...base(), weightKg });
      expectValidationError(response, 'weightKg');
    });

    it.each([
      ['origin', ''],
      ['destination', 'x'.repeat(201)],
      ['description', 'x'.repeat(501)],
    ])('rejects %s out of length bounds', async (field, value) => {
      const response = await create({ ...base(), [field]: value });
      expectValidationError(response, field);
    });

    it.each([
      ['origin', 'Ky\u0000iv'],
      ['clientId', 'a\u0000b'],
    ])('rejects a NUL character in %s', async (field, value) => {
      const response = await create({ ...base(), [field]: value });
      expectValidationError(response, field);
      expect(await app.prisma.shipment.count()).toBe(0);
    });

    it('rejects malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/shipments',
        cookies: dispatcher.cookies,
        headers: { ...sessionRequest(dispatcher).headers, 'content-type': 'application/json' },
        payload: '{"clientId":',
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorBody).error.code).toBe('BAD_REQUEST');
    });
  });

  describe('concurrency', () => {
    it('gives parallel creates distinct consecutive tracking numbers', async () => {
      const responses = await Promise.all(Array.from({ length: 5 }, () => create(base())));
      for (const response of responses) {
        expect(response.statusCode).toBe(201);
      }
      const numbers = responses.map(
        (response) => shipmentResponseSchema.parse(response.json()).shipment.trackingNumber,
      );
      expect(numbers.sort()).toEqual([1, 2, 3, 4, 5].map(tracking));
      expect(await app.prisma.shipment.count()).toBe(5);
      expect(await app.prisma.movementEvent.count()).toBe(5);
    });
  });
});
