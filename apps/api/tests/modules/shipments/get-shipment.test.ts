import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Shipment } from '@prisma/client';
import { shipmentResponseSchema, type Role } from '@shipment-tracker/shared';
import { shipmentScope } from '../../../src/modules/shipments/shipments.service.js';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';

const UNAUTH = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Shipment not found' } };

describe('shipmentScope', () => {
  it('lets a dispatcher see every shipment', () => {
    expect(shipmentScope({ id: 'u1', role: 'DISPATCHER' })).toEqual({});
  });

  it('scopes a client to its own shipments', () => {
    expect(shipmentScope({ id: 'u1', role: 'CLIENT' })).toEqual({ clientId: 'u1' });
  });

  it('scopes a role added later to its own shipments (default deny)', () => {
    expect(shipmentScope({ id: 'u1', role: 'AUDITOR' as Role })).toEqual({ clientId: 'u1' });
  });
});

describe('GET /api/v1/shipments/:id', () => {
  let app: FastifyInstance;
  let dispatcher: TestSession;
  let owner: TestSession;
  let other: TestSession;
  let shipment: Shipment;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
    owner = await registerTestUser(app, { name: 'Owner Client' });
    other = await registerTestUser(app);
    shipment = await createTestShipment(app.prisma, owner.user.id, { status: 'IN_TRANSIT', weightKg: 12.5 });
  });

  afterAll(async () => {
    await app.close();
  });

  function get(id: string, session?: TestSession) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/shipments/${id}`,
      ...(session ? sessionRequest(session) : {}),
    });
  }

  it('rejects a request without cookies', async () => {
    const response = await get(shipment.id);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTH);
  });

  it('returns the shipment detail to its owner', async () => {
    const response = await get(shipment.id, owner);

    expect(response.statusCode).toBe(200);
    const body = shipmentResponseSchema.parse(response.json());
    expect(body.shipment.id).toBe(shipment.id);
    expect(body.shipment.trackingNumber).toBe(shipment.trackingNumber);
    expect(body.shipment.status).toBe('IN_TRANSIT');
    expect(body.shipment.weightKg).toBe(12.5);
    expect(body.shipment.carrier).toBe('SIMULATED');
    expect(body.shipment.client).toEqual({ id: owner.user.id, name: 'Owner Client', email: owner.user.email });
  });

  it('exposes neither clientId nor passwordHash in the raw JSON', async () => {
    const response = await get(shipment.id, owner);

    const raw = response.json<{ shipment: Record<string, unknown> }>();
    expect(raw.shipment).not.toHaveProperty('clientId');
    expect(response.body).not.toContain('passwordHash');
  });

  it('returns any shipment to a dispatcher', async () => {
    const response = await get(shipment.id, dispatcher);

    expect(response.statusCode).toBe(200);
    expect(shipmentResponseSchema.parse(response.json()).shipment.id).toBe(shipment.id);
  });

  it('answers 404 to a client asking for someone else’s shipment', async () => {
    const response = await get(shipment.id, other);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
  });

  it('answers 404 for an unknown id', async () => {
    const response = await get('doesnotexist', owner);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
  });

  it('answers a foreign id and an unknown id with byte-identical bodies', async () => {
    const foreign = await get(shipment.id, other);
    const unknown = await get('doesnotexist', owner);

    expect(foreign.body).toBe(unknown.body);
  });

  it.each(['x'.repeat(100), '%00', 'ABC-1'])('answers 404 (never 500) for the impossible id %s', async (id) => {
    const response = await get(id, owner);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
  });

  it('answers 414 in the envelope for an id over Fastify’s 100-character limit', async () => {
    const response = await get('x'.repeat(300), owner);

    expect(response.statusCode).toBe(414);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('BAD_REQUEST');
  });

  it('answers 400 in the envelope for a malformed percent-encoding', async () => {
    const response = await get('%zz', owner);

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('BAD_REQUEST');
  });

  it('returns events oldest first with every field mapped', async () => {
    const t1 = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const t2 = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const t3 = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const fixture = await createTestShipment(app.prisma, owner.user.id, {
      status: 'IN_TRANSIT',
      events: [
        { status: 'IN_TRANSIT', occurredAt: t3 },
        { status: 'CREATED', occurredAt: t1, source: 'SYSTEM' },
        { status: 'PICKED_UP', occurredAt: t2, location: 'Kyiv depot' },
      ],
    });

    const response = await get(fixture.id, owner);

    expect(response.statusCode).toBe(200);
    const { events } = shipmentResponseSchema.parse(response.json()).shipment;
    expect(events.map((event) => event.status)).toEqual(['CREATED', 'PICKED_UP', 'IN_TRANSIT']);
    expect(events[0]?.source).toBe('SYSTEM');
    expect(events[1]?.location).toBe('Kyiv depot');
    expect(events[0]?.location).toBeNull();
    expect(events[0]?.note).toBeNull();
    expect(events[2]?.occurredAt).toBe(t3.toISOString());
  });

  it('lists the legal next statuses of an IN_TRANSIT shipment', async () => {
    const response = await get(shipment.id, owner);

    expect(shipmentResponseSchema.parse(response.json()).shipment.allowedNextStatuses).toEqual([
      'IN_TRANSIT',
      'AT_WAREHOUSE',
      'OUT_FOR_DELIVERY',
      'EXCEPTION',
    ]);
  });

  it('lists no next statuses for a DELIVERED shipment', async () => {
    const delivered = await createTestShipment(app.prisma, owner.user.id, { status: 'DELIVERED' });

    const response = await get(delivered.id, owner);

    expect(shipmentResponseSchema.parse(response.json()).shipment.allowedNextStatuses).toEqual([]);
  });

  it('maps a missing weight to null', async () => {
    const weightless = await createTestShipment(app.prisma, owner.user.id);

    const response = await get(weightless.id, owner);

    expect(shipmentResponseSchema.parse(response.json()).shipment.weightKg).toBeNull();
  });

  it('answers 404 once the shipment has been deleted', async () => {
    await app.prisma.movementEvent.deleteMany();
    await app.prisma.shipment.deleteMany();

    const response = await get(shipment.id, owner);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
  });
});
