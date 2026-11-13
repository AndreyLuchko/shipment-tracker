import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Shipment } from '@prisma/client';
import type { ShipmentDetail, ShipmentStatus } from '@shipment-tracker/shared';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, sessionRequest, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';
import { ALL_TRANSITIONS, isLegalTransition } from '../../helpers/transitions.js';
import { postWebhook } from '../../helpers/webhooks.js';

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Shipment not found' } };
const EARLIER = [{ path: 'occurredAt', message: 'occurredAt must not be earlier than the latest event' }];
const FUTURE = [{ path: 'occurredAt', message: 'occurredAt must not be in the future' }];

const ILLEGAL = (from: ShipmentStatus, to: ShipmentStatus) => ({
  error: { code: 'INVALID_STATUS_TRANSITION', message: `Cannot transition from ${from} to ${to}` },
});

const ACK = (trackingNumber: string, shipmentStatus: ShipmentStatus, duplicate: boolean) => ({
  trackingNumber,
  shipmentStatus,
  duplicate,
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const iso = (date: Date) => date.toISOString();

const TRACKING = 'ST-TEST-PIPE';

let app: FastifyInstance;
let dispatcher: TestSession;
let owner: TestSession;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

/** What a rejected event must leave untouched. */
async function snapshot(id: string) {
  const row = await app.prisma.shipment.findUniqueOrThrow({
    where: { id },
    select: { status: true, updatedAt: true, _count: { select: { events: true } } },
  });
  return { status: row.status, updatedAt: row.updatedAt, eventCount: row._count.events };
}

/** Asserts `VALIDATION_ERROR` with a `details` entry on every one of `paths`. */
function expectValidationError(response: LightMyRequestResponse, ...paths: string[]) {
  expect(response.statusCode).toBe(400);
  const body = response.json() as ErrorBody;
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.message).toBe('Request validation failed');
  const detailPaths = (body.error.details ?? []).map((detail) => detail.path);
  for (const path of paths) {
    expect(detailPaths).toContain(path);
  }
}

function detailsOf(response: LightMyRequestResponse) {
  return (response.json() as ErrorBody).error.details;
}

describe('POST /api/v1/webhooks/carrier — event pipeline', () => {
  let shipment: Shipment;
  let T0: Date;
  let T1: Date;
  let X: string;

  beforeEach(async () => {
    await resetDb(app.prisma);
    dispatcher = await registerTestUser(app, { role: 'DISPATCHER' });
    owner = await registerTestUser(app);
    T0 = ago(180);
    T1 = ago(120);
    shipment = await createTestShipment(app.prisma, owner.user.id, {
      trackingNumber: TRACKING,
      status: 'PICKED_UP',
      events: [
        { status: 'CREATED', occurredAt: T0, source: 'SYSTEM' },
        { status: 'PICKED_UP', occurredAt: T1 },
      ],
    });
    X = iso(ago(60));
  });

  function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { trackingNumber: TRACKING, status: 'IN_TRANSIT', occurredAt: X, ...overrides };
  }

  function hook(overrides: Record<string, unknown> = {}) {
    return postWebhook(app, event(overrides));
  }

  function manual(payload: Record<string, unknown>, id: string = shipment.id) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/shipments/${id}/events`,
      ...sessionRequest(dispatcher),
      payload,
    });
  }

  function stored(status: ShipmentStatus, id: string = shipment.id) {
    return app.prisma.movementEvent.findMany({ where: { shipmentId: id, status } });
  }

  async function detail(id: string = shipment.id): Promise<ShipmentDetail> {
    const response = await app.inject({ method: 'GET', url: `/api/v1/shipments/${id}`, ...sessionRequest(owner) });
    expect(response.statusCode).toBe(200);
    return (response.json() as { shipment: ShipmentDetail }).shipment;
  }

  function outForDelivery(trackingNumber = 'ST-TEST-OFD') {
    return createTestShipment(app.prisma, owner.user.id, { trackingNumber, status: 'OUT_FOR_DELIVERY' });
  }

  describe('validation', () => {
    it('rejects an empty object on trackingNumber, status and occurredAt', async () => {
      const before = await snapshot(shipment.id);

      const response = await postWebhook(app, {});

      expectValidationError(response, 'trackingNumber', 'status', 'occurredAt');
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it('requires occurredAt', async () => {
      const before = await snapshot(shipment.id);
      const withoutOccurredAt = event();
      delete withoutOccurredAt.occurredAt;

      const response = await postWebhook(app, withoutOccurredAt);

      expectValidationError(response, 'occurredAt');
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it.each<[unknown]>([['2026-11-12 10:30'], ['2026-11-12T10:30:00+02:00'], [1731407400000]])(
      'rejects occurredAt %j',
      async (occurredAt) => {
        const before = await snapshot(shipment.id);

        const response = await hook({ occurredAt });

        expectValidationError(response, 'occurredAt');
        expect(await snapshot(shipment.id)).toEqual(before);
      },
    );

    it.each([['LOST'], ['in_transit']])('rejects status %j', async (status) => {
      const before = await snapshot(shipment.id);

      const response = await hook({ status });

      expectValidationError(response, 'status');
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it.each<[string, Record<string, unknown>]>([
      ['location', { location: 'x'.repeat(201) }],
      ['note', { note: 'x'.repeat(501) }],
      ['note', { note: 'a\u0000b' }],
      ['location', { location: null }],
    ])('rejects %s in %j', async (path, overrides) => {
      const before = await snapshot(shipment.id);

      const response = await hook(overrides);

      expectValidationError(response, path);
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it.each<[unknown]>([[''], ['x'.repeat(65)], [123]])('rejects trackingNumber %j', async (trackingNumber) => {
      const before = await snapshot(shipment.id);

      const response = await hook({ trackingNumber });

      expectValidationError(response, 'trackingNumber');
      expect(await snapshot(shipment.id)).toEqual(before);
    });
  });

  describe('accepted input', () => {
    it('ignores forged server-owned keys and stores source WEBHOOK', async () => {
      const response = await hook({
        source: 'MANUAL',
        id: 'forged',
        carrier: 'DHL',
        createdAt: '2000-01-01T00:00:00.000Z',
      });

      expect(response.statusCode).toBe(201);
      const [row] = await stored('IN_TRANSIT');
      expect(row!.source).toBe('WEBHOOK');
      expect(row!.id).not.toBe('forged');
    });

    it('stores a blank location as null', async () => {
      const response = await hook({ location: '   ' });

      expect(response.statusCode).toBe(201);
      const [row] = await stored('IN_TRANSIT');
      expect(row!.location).toBeNull();
    });
  });

  describe('idempotent duplicates', () => {
    it('answers a redelivery with 200 and duplicate: true and changes nothing', async () => {
      const first = await hook();
      expect(first.statusCode).toBe(201);
      expect(first.json()).toEqual(ACK(TRACKING, 'IN_TRANSIT', false));
      const afterFirst = await snapshot(shipment.id);

      const second = await hook();

      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual(ACK(TRACKING, 'IN_TRANSIT', true));
      expect(await snapshot(shipment.id)).toEqual(afterFirst);
    });

    it('keeps the first delivery when a duplicate carries other optional fields', async () => {
      expect((await hook({ location: 'Kyiv hub' })).statusCode).toBe(201);

      const second = await hook({ location: 'Other hub', note: 'changed' });

      expect(second.statusCode).toBe(200);
      const rows = await stored('IN_TRANSIT');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.location).toBe('Kyiv hub');
      expect(rows[0]!.note).toBeNull();
    });

    it('treats the same event with another key order as a duplicate', async () => {
      expect((await hook()).statusCode).toBe(201);

      const second = await postWebhook(
        app,
        JSON.stringify({ occurredAt: X, status: 'IN_TRANSIT', trackingNumber: TRACKING }),
      );

      expect(second.statusCode).toBe(200);
    });

    it('treats the same instant written two ways as a duplicate', async () => {
      const base = new Date(Math.floor(ago(60).getTime() / 1000) * 1000);

      expect((await hook({ occurredAt: iso(base) })).statusCode).toBe(201);
      expect((await hook({ occurredAt: iso(base).replace('.000Z', 'Z') })).statusCode).toBe(200);
    });

    it('answers a redelivered DELIVERED with 200, not 422', async () => {
      await outForDelivery();

      expect((await hook({ trackingNumber: 'ST-TEST-OFD', status: 'DELIVERED' })).statusCode).toBe(201);
      expect((await hook({ trackingNumber: 'ST-TEST-OFD', status: 'DELIVERED' })).statusCode).toBe(200);
    });

    it('answers a redelivery after the shipment moved on with 200', async () => {
      expect((await hook()).statusCode).toBe(201);
      expect((await hook({ status: 'AT_WAREHOUSE', occurredAt: iso(ago(30)) })).statusCode).toBe(201);
      const before = await snapshot(shipment.id);

      const third = await hook();

      expect(third.statusCode).toBe(200);
      expect(third.json()).toEqual(ACK(TRACKING, 'AT_WAREHOUSE', true));
      expect((await snapshot(shipment.id)).eventCount).toBe(before.eventCount);
    });

    it('stores two events with the same time and different statuses', async () => {
      expect((await hook()).statusCode).toBe(201);
      expect((await hook({ status: 'EXCEPTION' })).statusCode).toBe(201);
    });

    it('treats a carrier event already recorded by a dispatcher as a duplicate', async () => {
      expect((await manual({ status: 'IN_TRANSIT', occurredAt: X })).statusCode).toBe(201);

      const response = await hook();

      expect(response.statusCode).toBe(200);
      expect((response.json() as { duplicate: boolean }).duplicate).toBe(true);
      const rows = await stored('IN_TRANSIT');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.source).toBe('MANUAL');
    });

    it('treats a dispatcher event already recorded by the carrier as a duplicate', async () => {
      expect((await hook()).statusCode).toBe(201);

      expect((await manual({ status: 'IN_TRANSIT', occurredAt: X })).statusCode).toBe(200);
      const rows = await stored('IN_TRANSIT');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.source).toBe('WEBHOOK');
    });
  });

  describe('occurredAt guards', () => {
    it.each<[string, () => Date, typeof FUTURE]>([
      ['one hour ahead', () => ago(-60), FUTURE],
      ['between the two fixture events', () => ago(150), EARLIER],
      ['before the CREATED event', () => ago(240), EARLIER],
    ])('rejects occurredAt %s', async (_label, at, expected) => {
      const before = await snapshot(shipment.id);

      const response = await hook({ occurredAt: iso(at()) });

      expect(response.statusCode).toBe(400);
      expect(detailsOf(response)).toEqual(expected);
      expect(await snapshot(shipment.id)).toEqual(before);
    });

    it("accepts exactly the latest event's time", async () => {
      expect((await hook({ occurredAt: iso(T1) })).statusCode).toBe(201);
    });

    it('rejects a late carrier scan after a dispatcher event at server time', async () => {
      expect((await manual({ status: 'IN_TRANSIT' })).statusCode).toBe(201);

      const response = await hook({ occurredAt: iso(ago(1)) });

      expect(response.statusCode).toBe(400);
      expect(detailsOf(response)).toEqual(EARLIER);
      expect(await stored('IN_TRANSIT')).toHaveLength(1);
    });

    it('keeps the timeline ordered', async () => {
      expect((await hook()).statusCode).toBe(201);
      expect((await hook({ status: 'AT_WAREHOUSE', occurredAt: iso(ago(30)) })).statusCode).toBe(201);

      const shipmentDetail = await detail();

      expect(shipmentDetail.events.map((e) => e.status)).toEqual([
        'CREATED',
        'PICKED_UP',
        'IN_TRANSIT',
        'AT_WAREHOUSE',
      ]);
      expect(shipmentDetail.events[shipmentDetail.events.length - 1]!.status).toBe(shipmentDetail.status);
    });
  });

  describe('check order', () => {
    it('reports the future occurredAt before the illegal transition', async () => {
      const response = await hook({ status: 'DELIVERED', occurredAt: iso(ago(-60)) });

      expect(response.statusCode).toBe(400);
      expect(detailsOf(response)).toEqual(FUTURE);
    });

    it('reports the illegal transition before the stale occurredAt', async () => {
      const response = await hook({ status: 'DELIVERED', occurredAt: iso(ago(150)) });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual(ILLEGAL('PICKED_UP', 'DELIVERED'));
    });

    it('reports an invalid payload before an unknown tracking number', async () => {
      const response = await hook({ trackingNumber: 'ST-NOPE', status: 'LOST' });

      expectValidationError(response, 'status');
    });

    it('reports an unknown tracking number before a future occurredAt', async () => {
      const response = await hook({ trackingNumber: 'ST-NOPE', occurredAt: iso(ago(-60)) });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(NOT_FOUND);
    });
  });

  describe('manual and carrier events share one timeline', () => {
    it('interleaves webhook and manual events', async () => {
      expect((await hook()).statusCode).toBe(201);
      expect((await manual({ status: 'AT_WAREHOUSE', occurredAt: iso(ago(30)) })).statusCode).toBe(201);
      expect((await hook({ occurredAt: iso(ago(10)) })).statusCode).toBe(201);

      const shipmentDetail = await detail();

      expect(shipmentDetail.events.map((e) => e.status)).toEqual([
        'CREATED',
        'PICKED_UP',
        'IN_TRANSIT',
        'AT_WAREHOUSE',
        'IN_TRANSIT',
      ]);
      expect(shipmentDetail.events.map((e) => e.source)).toEqual(['SYSTEM', 'WEBHOOK', 'WEBHOOK', 'MANUAL', 'WEBHOOK']);
      expect(shipmentDetail.status).toBe('IN_TRANSIT');
    });
  });

  describe('concurrency', () => {
    const sortedCodes = (responses: LightMyRequestResponse[]) =>
      responses.map((response) => response.statusCode).sort((a, b) => a - b);

    it('stores exactly one of two parallel identical deliveries', async () => {
      const ofd = await outForDelivery();

      const responses = await Promise.all([
        hook({ trackingNumber: 'ST-TEST-OFD', status: 'DELIVERED' }),
        hook({ trackingNumber: 'ST-TEST-OFD', status: 'DELIVERED' }),
      ]);

      expect(sortedCodes(responses)).toEqual([200, 201]);
      expect(await stored('DELIVERED', ofd.id)).toHaveLength(1);
    });

    it('stores exactly one of two parallel DELIVERED events with different times', async () => {
      const ofd = await outForDelivery();

      const responses = await Promise.all([
        hook({ trackingNumber: 'ST-TEST-OFD', status: 'DELIVERED', occurredAt: iso(ago(2)) }),
        hook({ trackingNumber: 'ST-TEST-OFD', status: 'DELIVERED', occurredAt: iso(ago(1)) }),
      ]);

      expect(sortedCodes(responses)).toEqual([201, 422]);
      expect(await stored('DELIVERED', ofd.id)).toHaveLength(1);
      expect((await snapshot(ofd.id)).status).toBe('DELIVERED');
    });

    it('stores exactly one of a parallel webhook and manual DELIVERED', async () => {
      const ofd = await outForDelivery();

      const responses = await Promise.all([
        hook({ trackingNumber: 'ST-TEST-OFD', status: 'DELIVERED' }),
        manual({ status: 'DELIVERED', occurredAt: X }, ofd.id),
      ]);

      expect(sortedCodes(responses)).toEqual([200, 201]);
      expect(await stored('DELIVERED', ofd.id)).toHaveLength(1);
    });
  });
});

describe('all 49 transitions through the webhook', () => {
  beforeAll(async () => {
    await resetDb(app.prisma);
    owner = await registerTestUser(app);
  });

  it.each(ALL_TRANSITIONS)('%s -> %s', async (from, to) => {
    const shipment = await createTestShipment(app.prisma, owner.user.id, { status: from });
    const before = await snapshot(shipment.id);

    const response = await postWebhook(app, {
      trackingNumber: shipment.trackingNumber,
      status: to,
      occurredAt: iso(ago(1)),
    });

    if (isLegalTransition(from, to)) {
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(ACK(shipment.trackingNumber, to, false));
      expect((await snapshot(shipment.id)).eventCount).toBe(before.eventCount + 1);
    } else {
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual(ILLEGAL(from, to));
      expect(await snapshot(shipment.id)).toEqual(before);
    }
  });
});
