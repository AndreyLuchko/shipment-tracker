import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { shipmentListResponseSchema, shipmentResponseSchema, type ShipmentStatus } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';
import { ALL_TRANSITIONS, isLegalTransition } from '../../helpers/transitions.js';

const UNAUTH = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } };
const CSRF = { error: { code: 'CSRF_TOKEN_INVALID', message: 'CSRF token missing or invalid' } };
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Shipment not found' } };

const ILLEGAL = (from: ShipmentStatus, to: ShipmentStatus) => ({
  error: { code: 'INVALID_STATUS_TRANSITION', message: `Cannot transition from ${from} to ${to}` },
});

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

/** Asserts `VALIDATION_ERROR` with a `details` entry on `path`. */
function expectValidationError(response: { statusCode: number; json: () => unknown }, path: string) {
  expect(response.statusCode).toBe(400);
  const body = response.json() as ErrorBody;
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toBe('Request validation failed');
  expect((body.error.details ?? []).map((detail) => detail.path)).toContain(path);
}

let app: FastifyInstance;
let dispatcher: TestSession;
let owner: TestSession;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

function post(id: string, payload: unknown, session: TestSession = dispatcher) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/shipments/${id}/events`,
    ...sessionRequest(session),
    payload: payload as Record<string, unknown>,
  });
}

/** What a rejected event must leave untouched. */
async function snapshot(id: string) {
  const row = await app.prisma.shipment.findUniqueOrThrow({
    where: { id },
    select: { status: true, updatedAt: true, _count: { select: { events: true } } },
  });
  return { status: row.status, updatedAt: row.updatedAt, eventCount: row._count.events };
}

function lastStoredEvent(shipmentId: string) {
  return app.prisma.movementEvent.findFirstOrThrow({
    where: { shipmentId },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
}

describe('POST /api/v1/shipments/:id/events', () => {
  beforeEach(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
    owner = await registerTestUser(app);
  });

  describe('access', () => {
    it('rejects a request without cookies', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/shipments/${shipment.id}/events`,
        payload: { status: 'PICKED_UP' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
    });

    it('forbids the owning client', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);
      const before = await snapshot(shipment.id);

      const response = await post(shipment.id, { status: 'PICKED_UP' }, owner);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(FORBIDDEN);
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it('rejects a dispatcher request without the CSRF header', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);
      const before = await snapshot(shipment.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/shipments/${shipment.id}/events`,
        cookies: dispatcher.cookies,
        payload: { status: 'PICKED_UP' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(CSRF);
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it.each(['doesnotexist', '%00'])('answers 404 for the id %s', async (id) => {
      const response = await post(id, { status: 'PICKED_UP' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(NOT_FOUND);
    });
  });

  describe('behavior', () => {
    it('stores a legal event and returns the updated detail', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);
      const before = await snapshot(shipment.id);

      const response = await post(shipment.id, {
        status: 'PICKED_UP',
        location: ' Kyiv depot ',
        note: 'Picked up by courier',
      });

      expect(response.statusCode).toBe(201);
      const body = shipmentResponseSchema.parse(response.json()).shipment;
      expect(body.status).toBe('PICKED_UP');
      expect(body.events).toHaveLength(2);
      const last = body.events.at(-1)!;
      expect(last).toMatchObject({
        status: 'PICKED_UP',
        source: 'MANUAL',
        location: 'Kyiv depot',
        note: 'Picked up by courier',
      });
      const occurredAt = new Date(last.occurredAt).getTime();
      expect(occurredAt).toBeLessThanOrEqual(Date.now());
      expect(occurredAt).toBeGreaterThan(Date.now() - 60_000);
      expect(body.allowedNextStatuses).toEqual(['PICKED_UP', 'IN_TRANSIT', 'EXCEPTION']);

      const after = await snapshot(shipment.id);
      expect(after.status).toBe('PICKED_UP');
      expect(after.eventCount).toBe(before.eventCount + 1);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });

    it('stores a self-loop and moves updatedAt', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id, { status: 'IN_TRANSIT' });
      const before = await snapshot(shipment.id);

      const response = await post(shipment.id, { status: 'IN_TRANSIT', location: 'Dnipro hub' });

      expect(response.statusCode).toBe(201);
      const body = shipmentResponseSchema.parse(response.json()).shipment;
      expect(body.status).toBe('IN_TRANSIT');
      expect(body.events).toHaveLength(3);
      const after = await snapshot(shipment.id);
      expect(after.eventCount).toBe(before.eventCount + 1);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });

    it.each<[ShipmentStatus, ShipmentStatus]>([
      ['DELIVERED', 'IN_TRANSIT'],
      ['CREATED', 'DELIVERED'],
    ])('rejects %s -> %s with 422 and leaves no trace', async (from, to) => {
      const shipment = await createTestShipment(app.prisma, owner.user.id, { status: from });
      const before = await snapshot(shipment.id);

      const response = await post(shipment.id, { status: to });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual(ILLEGAL(from, to));
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it.each([{}, { status: 'LOST' }])('rejects the body %j with VALIDATION_ERROR on status', async (payload) => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);
      const before = await snapshot(shipment.id);

      const response = await post(shipment.id, payload);

      expectValidationError(response, 'status');
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it.each([
      ['location', { status: 'PICKED_UP', location: 'x'.repeat(201) }],
      ['note', { status: 'PICKED_UP', note: 'x'.repeat(501) }],
      ['note', { status: 'PICKED_UP', note: 'a\u0000b' }],
    ])('rejects an invalid %s', async (path, payload) => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);
      const before = await snapshot(shipment.id);

      const response = await post(shipment.id, payload);

      expectValidationError(response, path);
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it('stores a blank location as null', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);

      const response = await post(shipment.id, { status: 'PICKED_UP', location: '   ' });

      expect(response.statusCode).toBe(201);
      expect((await lastStoredEvent(shipment.id)).location).toBeNull();
    });

    it('ignores source, id and createdAt from the body', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);

      const response = await post(shipment.id, {
        status: 'PICKED_UP',
        source: 'WEBHOOK',
        id: 'forced',
        createdAt: '2000-01-01T00:00:00.000Z',
      });

      expect(response.statusCode).toBe(201);
      const stored = await lastStoredEvent(shipment.id);
      expect(stored.status).toBe('PICKED_UP');
      expect(stored.source).toBe('MANUAL');
      expect(stored.id).not.toBe('forced');
      expect(stored.createdAt.getUTCFullYear()).not.toBe(2000);
    });

    it('is visible to the owner in the detail and in the status filter', async () => {
      const shipment = await createTestShipment(app.prisma, owner.user.id);
      expect((await post(shipment.id, { status: 'PICKED_UP' })).statusCode).toBe(201);

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/shipments/${shipment.id}`,
        cookies: owner.cookies,
      });
      expect(detail.statusCode).toBe(200);
      const body = shipmentResponseSchema.parse(detail.json()).shipment;
      expect(body.status).toBe('PICKED_UP');
      expect(body.events).toHaveLength(2);

      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/shipments?status=PICKED_UP',
        cookies: owner.cookies,
      });
      expect(list.statusCode).toBe(200);
      expect(shipmentListResponseSchema.parse(list.json()).total).toBe(1);
    });
  });
});

describe('all 49 transitions over HTTP', () => {
  // The single exception in M3: one reset for 49 cases, each with its own shipment.
  beforeAll(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
    owner = await registerTestUser(app);
  });

  it.each(ALL_TRANSITIONS)('%s -> %s', async (from, to) => {
    const shipment = await createTestShipment(app.prisma, owner.user.id, { status: from });
    const before = await snapshot(shipment.id);

    const response = await post(shipment.id, { status: to });

    if (isLegalTransition(from, to)) {
      expect(response.statusCode).toBe(201);
      expect((await snapshot(shipment.id)).status).toBe(to);
      expect((await snapshot(shipment.id)).eventCount).toBe(before.eventCount + 1);
    } else {
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual(ILLEGAL(from, to));
      expect(await snapshot(shipment.id)).toEqual(before);
    }
  });
});
