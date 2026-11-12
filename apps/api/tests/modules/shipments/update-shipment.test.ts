import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Shipment } from '@prisma/client';
import { shipmentResponseSchema } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';

const UNAUTH = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } };
const CSRF = { error: { code: 'CSRF_TOKEN_INVALID', message: 'CSRF token missing or invalid' } };
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Shipment not found' } };

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

describe('PATCH /api/v1/shipments/:id', () => {
  let app: FastifyInstance;
  let dispatcher: TestSession;
  let owner: TestSession;
  let shipment: Shipment;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
    owner = await registerTestUser(app);
    shipment = await createTestShipment(app.prisma, owner.user.id, {
      status: 'IN_TRANSIT',
      description: 'Old text',
      weightKg: 12.5,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function patch(id: string, payload: unknown, session: TestSession = dispatcher) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/shipments/${id}`,
      ...sessionRequest(session),
      payload: payload as Record<string, unknown>,
    });
  }

  function stored() {
    return app.prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
  }

  /** The row must be exactly as the fixture left it. */
  async function expectUnchanged() {
    const row = await stored();
    expect(row.description).toBe('Old text');
    expect(row.weightKg?.toNumber()).toBe(12.5);
    expect(row.status).toBe('IN_TRANSIT');
    expect(row.updatedAt).toEqual(shipment.updatedAt);
  }

  async function patchOk(payload: unknown) {
    const response = await patch(shipment.id, payload);
    expect(response.statusCode).toBe(200);
    return shipmentResponseSchema.parse(response.json()).shipment;
  }

  describe('access', () => {
    it('rejects a request without cookies', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/shipments/${shipment.id}`,
        payload: { description: 'Anon' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(UNAUTH);
      await expectUnchanged();
    });

    it('forbids the owning client', async () => {
      const response = await patch(shipment.id, { description: 'Mine' }, owner);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(FORBIDDEN);
      expect((await stored()).description).toBe('Old text');
    });

    it('rejects a dispatcher request without the CSRF header', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/shipments/${shipment.id}`,
        cookies: dispatcher.cookies,
        payload: { description: 'No header' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(CSRF);
      await expectUnchanged();
    });
  });

  describe('happy path', () => {
    it('updates the description, trimmed, and nothing else', async () => {
      const updated = await patchOk({ description: ' New text ' });

      expect(updated.description).toBe('New text');
      expect(updated.weightKg).toBe(12.5);
      expect(updated.status).toBe('IN_TRANSIT');
      expect(updated.events).toHaveLength(2);
      expect(await app.prisma.movementEvent.count({ where: { shipmentId: shipment.id } })).toBe(2);
      expect((await stored()).updatedAt.getTime()).toBeGreaterThan(shipment.updatedAt.getTime());
    });

    it('updates the weight only', async () => {
      const updated = await patchOk({ weightKg: 3.25 });

      expect(updated.weightKg).toBe(3.25);
      expect(updated.description).toBe('Old text');
    });

    it('clears the weight with null', async () => {
      const updated = await patchOk({ weightKg: null });

      expect(updated.weightKg).toBeNull();
      expect((await stored()).weightKg).toBeNull();
    });

    it('updates both fields at once', async () => {
      const updated = await patchOk({ description: 'Both', weightKg: 1 });

      expect(updated.description).toBe('Both');
      expect(updated.weightKg).toBe(1);
    });

    it('edits a delivered shipment', async () => {
      const delivered = await createTestShipment(app.prisma, owner.user.id, { status: 'DELIVERED' });

      const response = await patch(delivered.id, { description: 'After delivery' });

      expect(response.statusCode).toBe(200);
      expect(shipmentResponseSchema.parse(response.json()).shipment.description).toBe('After delivery');
    });

    it('is visible to the owner afterwards', async () => {
      await patchOk({ description: 'New text' });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/shipments/${shipment.id}`,
        ...sessionRequest(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(shipmentResponseSchema.parse(response.json()).shipment.description).toBe('New text');
    });
  });

  describe('validation', () => {
    it('rejects an empty body', async () => {
      const response = await patch(shipment.id, {});

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR');
      await expectUnchanged();
    });

    it('refuses to change the status', async () => {
      const response = await patch(shipment.id, { status: 'DELIVERED' });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorBody).error.details).toContainEqual({
        path: 'status',
        message: 'Unrecognized key',
      });
      expect((await stored()).status).toBe('IN_TRANSIT');
    });

    it('applies nothing when any key is not editable', async () => {
      const response = await patch(shipment.id, {
        description: 'Sneaky',
        origin: 'X',
        clientId: 'someone',
        trackingNumber: 'ST-X',
      });

      expect(response.statusCode).toBe(400);
      const details = (response.json() as ErrorBody).error.details;
      for (const path of ['origin', 'clientId', 'trackingNumber']) {
        expect(details).toContainEqual({ path, message: 'Unrecognized key' });
      }
      await expectUnchanged();
    });

    it.each([
      ['description', { description: '   ' }],
      ['description', { description: 'x'.repeat(501) }],
      ['weightKg', { weightKg: 0 }],
      ['weightKg', { weightKg: '5' }],
      ['description', { description: 'a\u0000b' }],
    ])('rejects an invalid %s: %j', async (path, payload) => {
      const response = await patch(shipment.id, payload);

      expectValidationError(response, path);
      await expectUnchanged();
    });
  });

  describe('not found', () => {
    it.each(['doesnotexist', '%00'])('answers 404 for the id %s', async (id) => {
      const response = await patch(id, { description: 'x' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(NOT_FOUND);
    });
  });
});
