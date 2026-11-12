import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Shipment } from '@prisma/client';
import type { ShipmentDetail } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

const EARLIER = [{ path: 'occurredAt', message: 'occurredAt must not be earlier than the latest event' }];
const FUTURE = [{ path: 'occurredAt', message: 'occurredAt must not be in the future' }];

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const iso = (date: Date) => date.toISOString();

let app: FastifyInstance;
let dispatcher: TestSession;
let owner: TestSession;
let T0: Date;
let T1: Date;
let shipment: Shipment;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb(app.prisma);
  dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
  owner = await registerTestUser(app);
  T0 = ago(180);
  T1 = ago(120);
  shipment = await createTestShipment(app.prisma, owner.user.id, {
    status: 'PICKED_UP',
    events: [
      { status: 'CREATED', occurredAt: T0, source: 'SYSTEM' },
      { status: 'PICKED_UP', occurredAt: T1 },
    ],
  });
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

function shipmentOf(response: { json: () => unknown }): ShipmentDetail {
  return (response.json() as { shipment: ShipmentDetail }).shipment;
}

function lastEventOf(response: { json: () => unknown }) {
  const events = shipmentOf(response).events;
  return events[events.length - 1]!;
}

function countEvents(shipmentId: string, status: Shipment['status']) {
  return app.prisma.movementEvent.count({ where: { shipmentId, status } });
}

function expectDetails(response: { statusCode: number; json: () => unknown }, details: unknown) {
  expect(response.statusCode).toBe(400);
  const body = response.json() as ErrorBody;
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.details).toEqual(details);
}

describe('POST /api/v1/shipments/:id/events — occurredAt', () => {
  it('stores an explicit occurredAt between the latest event and now', async () => {
    const T = ago(60);

    const response = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: iso(T) });

    expect(response.statusCode).toBe(201);
    expect(lastEventOf(response).occurredAt).toBe(iso(T));
    const stored = await app.prisma.movementEvent.findFirstOrThrow({
      where: { shipmentId: shipment.id, status: 'IN_TRANSIT' },
    });
    expect(stored.occurredAt.getTime()).toBe(T.getTime());
  });

  it('accepts an occurredAt equal to the latest event', async () => {
    const response = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: iso(T1) });

    expect(response.statusCode).toBe(201);
  });

  it.each([
    ['between the two fixture events', 150],
    ['before the CREATED event', 240],
  ])('rejects an occurredAt %s', async (_label, minutes) => {
    const before = await snapshot(shipment.id);

    const response = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: iso(ago(minutes)) });

    expectDetails(response, EARLIER);
    expect(await snapshot(shipment.id)).toEqual(before);
  });

  it('rejects an occurredAt in the future', async () => {
    const before = await snapshot(shipment.id);

    const response = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: iso(ago(-60)) });

    expectDetails(response, FUTURE);
    expect(await snapshot(shipment.id)).toEqual(before);
  });

  it('defaults occurredAt to the server time', async () => {
    const response = await post(shipment.id, { status: 'IN_TRANSIT' });

    expect(response.statusCode).toBe(201);
    const occurredAt = new Date(lastEventOf(response).occurredAt).getTime();
    expect(occurredAt).toBeGreaterThan(ago(1).getTime());
    expect(occurredAt).toBeLessThanOrEqual(Date.now());
    expect(occurredAt).toBeGreaterThanOrEqual(ago(120).getTime());
  });

  it.each(['2026-11-12 10:30', '2026-11-12T10:30:00+02:00', 1731407400000])(
    'rejects occurredAt %j',
    async (occurredAt) => {
      const before = await snapshot(shipment.id);

      const response = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt });

      expect(response.statusCode).toBe(400);
      const body = response.json() as ErrorBody;
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Request validation failed');
      expect((body.error.details ?? []).map((detail) => detail.path)).toContain('occurredAt');
      expect(await snapshot(shipment.id)).toEqual(before);
    },
  );

  it('keeps the timeline ordered', async () => {
    expect((await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: iso(ago(60)) })).statusCode).toBe(201);
    expect((await post(shipment.id, { status: 'AT_WAREHOUSE', occurredAt: iso(ago(30)) })).statusCode).toBe(201);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/shipments/${shipment.id}`,
      ...sessionRequest(dispatcher),
    });

    expect(response.statusCode).toBe(200);
    const detail = shipmentOf(response);
    expect(detail.events.map((event) => event.status)).toEqual(['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_WAREHOUSE']);
    expect(detail.events[detail.events.length - 1]!.status).toBe(detail.status);
  });
});

describe('POST /api/v1/shipments/:id/events — check order', () => {
  it('reports a future timestamp before an illegal transition', async () => {
    const response = await post(shipment.id, { status: 'DELIVERED', occurredAt: iso(ago(-60)) });

    expectDetails(response, FUTURE);
  });

  it('reports an illegal transition before an earlier-than-latest timestamp', async () => {
    const response = await post(shipment.id, { status: 'DELIVERED', occurredAt: iso(ago(150)) });

    expect(response.statusCode).toBe(422);
    expect((response.json() as ErrorBody).error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('POST /api/v1/shipments/:id/events — idempotent duplicates', () => {
  let X: string;

  beforeEach(() => {
    X = iso(ago(60));
  });

  it('answers an exact repeat with 200 and stores nothing', async () => {
    const first = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: X });
    const afterFirst = await snapshot(shipment.id);
    const second = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: X });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(shipmentOf(second)).toEqual(shipmentOf(first));
    expect(await snapshot(shipment.id)).toEqual(afterFirst);
  });

  it('ignores location in the comparison and keeps the first event', async () => {
    await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: X, location: 'Kyiv hub' });
    const afterFirst = await snapshot(shipment.id);

    const second = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: X, location: 'Other hub' });

    expect(second.statusCode).toBe(200);
    const stored = await app.prisma.movementEvent.findFirstOrThrow({
      where: { shipmentId: shipment.id, status: 'IN_TRANSIT' },
    });
    expect(stored.location).toBe('Kyiv hub');
    expect((await snapshot(shipment.id)).eventCount).toBe(afterFirst.eventCount);
  });

  it('answers a repeated DELIVERED with 200, not 422', async () => {
    const outForDelivery = await createTestShipment(app.prisma, owner.user.id, { status: 'OUT_FOR_DELIVERY' });

    const first = await post(outForDelivery.id, { status: 'DELIVERED', occurredAt: X });
    const second = await post(outForDelivery.id, { status: 'DELIVERED', occurredAt: X });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
  });

  it('answers a retry after a later transition with 200', async () => {
    await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: X });
    await post(shipment.id, { status: 'AT_WAREHOUSE', occurredAt: iso(ago(30)) });
    const before = await snapshot(shipment.id);

    const third = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: X });

    expect(third.statusCode).toBe(200);
    expect(shipmentOf(third).status).toBe('AT_WAREHOUSE');
    expect((await snapshot(shipment.id)).eventCount).toBe(before.eventCount);
  });

  it('stores two events with the same time and different statuses', async () => {
    const before = await snapshot(shipment.id);

    const first = await post(shipment.id, { status: 'IN_TRANSIT', occurredAt: X });
    const second = await post(shipment.id, { status: 'EXCEPTION', occurredAt: X });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((await snapshot(shipment.id)).eventCount).toBe(before.eventCount + 2);
  });

  it('stores two events when both rely on the default timestamp', async () => {
    const before = await snapshot(shipment.id);

    const first = await post(shipment.id, { status: 'IN_TRANSIT' });
    const second = await post(shipment.id, { status: 'IN_TRANSIT' });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((await snapshot(shipment.id)).eventCount).toBe(before.eventCount + 2);
  });
});

describe('POST /api/v1/shipments/:id/events — concurrency', () => {
  let outForDelivery: Shipment;

  beforeEach(async () => {
    // Default fixture: latest event (OUT_FOR_DELIVERY) at now − 120 min.
    outForDelivery = await createTestShipment(app.prisma, owner.user.id, { status: 'OUT_FOR_DELIVERY' });
  });

  it('stores exactly one of two parallel DELIVERED events with different times', async () => {
    const responses = await Promise.all([
      post(outForDelivery.id, { status: 'DELIVERED', occurredAt: iso(ago(2)) }),
      post(outForDelivery.id, { status: 'DELIVERED', occurredAt: iso(ago(1)) }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 422]);
    expect(await countEvents(outForDelivery.id, 'DELIVERED')).toBe(1);
    expect((await snapshot(outForDelivery.id)).status).toBe('DELIVERED');
  });

  it('stores exactly one of two parallel identical DELIVERED events', async () => {
    const X = iso(ago(60));

    const responses = await Promise.all([
      post(outForDelivery.id, { status: 'DELIVERED', occurredAt: X }),
      post(outForDelivery.id, { status: 'DELIVERED', occurredAt: X }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201]);
    expect(await countEvents(outForDelivery.id, 'DELIVERED')).toBe(1);
  });
});
