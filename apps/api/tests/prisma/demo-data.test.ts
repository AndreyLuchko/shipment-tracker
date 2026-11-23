// apps/api/tests/prisma/demo-data.test.ts
import { describe, expect, it } from 'vitest';
import {
  createShipmentEventSchema,
  createShipmentSchema,
  SHIPMENT_STATUSES,
  type ShipmentStatus,
} from '@shipment-tracker/shared';
import { DEMO_CLIENT_EMAIL, DEMO_EXTRA_CLIENTS, buildDemoShipments } from '../../prisma/demo-data.js';
import { canTransition } from '../../src/lib/state-machine.js';

const SEED_NOW = new Date('2026-11-22T12:00:00.000Z');
const DEMO = buildDemoShipments(SEED_NOW);
const HOUR_MS = 60 * 60 * 1000;

function currentStatus(events: { status: ShipmentStatus }[]): ShipmentStatus {
  return events[events.length - 1]!.status;
}

function statusCounts(shipments: typeof DEMO): Record<ShipmentStatus, number> {
  const counts = Object.fromEntries(SHIPMENT_STATUSES.map((status) => [status, 0])) as Record<ShipmentStatus, number>;
  for (const shipment of shipments) counts[currentStatus(shipment.events)] += 1;
  return counts;
}

function byNumber(trackingNumber: string) {
  const shipment = DEMO.find((candidate) => candidate.trackingNumber === trackingNumber);
  if (!shipment) throw new Error(`missing ${trackingNumber}`);
  return shipment;
}

describe('buildDemoShipments', () => {
  it('has 30 shipments numbered ST-2026-000001 … ST-2026-000030, each once', () => {
    const expected = Array.from({ length: 30 }, (_, index) => `ST-2026-${String(index + 1).padStart(6, '0')}`);
    expect(DEMO.map((shipment) => shipment.trackingNumber).sort()).toEqual(expected);
  });

  it('orders by creation time the same way as by tracking number', () => {
    const created = [...DEMO]
      .sort((a, b) => a.trackingNumber.localeCompare(b.trackingNumber))
      .map((shipment) => shipment.events[0]!.occurredAt.getTime());
    for (let index = 1; index < created.length; index += 1) {
      expect(created[index]!).toBeGreaterThan(created[index - 1]!);
    }
  });

  it('starts every timeline with CREATED from SYSTEM', () => {
    for (const shipment of DEMO) {
      expect(shipment.events[0]).toMatchObject({ status: 'CREATED', source: 'SYSTEM' });
    }
  });

  it('has only legal transitions in every timeline', () => {
    for (const shipment of DEMO) {
      for (let index = 1; index < shipment.events.length; index += 1) {
        const previous = shipment.events[index - 1]!.status;
        const next = shipment.events[index]!.status;
        expect(canTransition(previous, next), `${shipment.trackingNumber}: ${previous} -> ${next}`).toBe(true);
      }
    }
  });

  it('strictly increases occurredAt inside every timeline', () => {
    for (const shipment of DEMO) {
      for (let index = 1; index < shipment.events.length; index += 1) {
        expect(shipment.events[index]!.occurredAt.getTime(), shipment.trackingNumber).toBeGreaterThan(
          shipment.events[index - 1]!.occurredAt.getTime(),
        );
      }
    }
  });

  it('keeps every occurredAt within the last 30 days and at least 10 minutes in the past', () => {
    const earliest = SEED_NOW.getTime() - 30 * 24 * HOUR_MS;
    const latest = SEED_NOW.getTime() - 10 * 60 * 1000;
    for (const shipment of DEMO) {
      for (const event of shipment.events) {
        expect(event.occurredAt.getTime(), shipment.trackingNumber).toBeGreaterThanOrEqual(earliest);
        expect(event.occurredAt.getTime(), shipment.trackingNumber).toBeLessThanOrEqual(latest);
      }
    }
  });

  it('ends in the planned current statuses', () => {
    expect(statusCounts(DEMO)).toEqual({
      CREATED: 3,
      PICKED_UP: 3,
      IN_TRANSIT: 6,
      AT_WAREHOUSE: 4,
      OUT_FOR_DELIVERY: 3,
      DELIVERED: 8,
      EXCEPTION: 3,
    });
  });

  it('gives the demo client 10 shipments across every status, including the first and the last', () => {
    const own = DEMO.filter((shipment) => shipment.clientEmail === DEMO_CLIENT_EMAIL);
    expect(own).toHaveLength(10);
    expect(statusCounts(own)).toEqual({
      CREATED: 1,
      PICKED_UP: 1,
      IN_TRANSIT: 2,
      AT_WAREHOUSE: 1,
      OUT_FOR_DELIVERY: 1,
      DELIVERED: 3,
      EXCEPTION: 1,
    });
    const numbers = own.map((shipment) => shipment.trackingNumber);
    expect(numbers).toContain('ST-2026-000001');
    expect(numbers).toContain('ST-2026-000030');
  });

  it('is owned by the demo client or an extra client, each extra client owning at least 5', () => {
    const extraEmails = DEMO_EXTRA_CLIENTS.map((client) => client.email);
    expect(DEMO_EXTRA_CLIENTS.map((client) => client.name)).toEqual([
      'Kyiv Coffee Roasters',
      'Lviv Print House',
      'Odesa Marine Supply',
    ]);
    expect(extraEmails).toEqual(['kyiv.coffee@demo.dev', 'lviv.print@demo.dev', 'odesa.marine@demo.dev']);
    for (const shipment of DEMO) {
      expect([DEMO_CLIENT_EMAIL, ...extraEmails]).toContain(shipment.clientEmail);
    }
    for (const email of extraEmails) {
      expect(DEMO.filter((shipment) => shipment.clientEmail === email).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('gives ST-2026-000001 a long delivered timeline with warehouse stops and a self-loop', () => {
    const { events } = byNumber('ST-2026-000001');
    const statuses = events.map((event) => event.status);
    expect(currentStatus(events)).toBe('DELIVERED');
    expect(events.length).toBeGreaterThanOrEqual(12);
    expect(statuses.filter((status) => status === 'AT_WAREHOUSE').length).toBeGreaterThanOrEqual(2);
    expect(statuses.some((status, index) => status === 'IN_TRANSIT' && statuses[index + 1] === 'IN_TRANSIT')).toBe(
      true,
    );
  });

  it('has a shipment that recovered from an EXCEPTION', () => {
    const recovered = DEMO.filter(
      (shipment) =>
        shipment.events.some((event) => event.status === 'EXCEPTION') && currentStatus(shipment.events) !== 'EXCEPTION',
    );
    expect(recovered.length).toBeGreaterThanOrEqual(1);
  });

  it('has a direct IN_TRANSIT to OUT_FOR_DELIVERY step', () => {
    const direct = DEMO.some((shipment) =>
      shipment.events.some(
        (event, index) => event.status === 'OUT_FOR_DELIVERY' && shipment.events[index - 1]?.status === 'IN_TRANSIT',
      ),
    );
    expect(direct).toBe(true);
  });

  it('leaves ST-2026-000029 and ST-2026-000030 with only their CREATED event', () => {
    expect(byNumber('ST-2026-000029').events).toHaveLength(1);
    expect(byNumber('ST-2026-000030').events).toHaveLength(1);
    expect(byNumber('ST-2026-000029').clientEmail).not.toBe(DEMO_CLIENT_EMAIL);
  });

  it('gives every EXCEPTION event a non-empty note', () => {
    for (const shipment of DEMO) {
      for (const event of shipment.events.filter((candidate) => candidate.status === 'EXCEPTION')) {
        expect(event.note?.trim().length ?? 0, shipment.trackingNumber).toBeGreaterThan(0);
      }
    }
  });

  it('sources every later event from WEBHOOK or MANUAL, with at least 3 MANUAL', () => {
    const later = DEMO.flatMap((shipment) => shipment.events.slice(1));
    for (const event of later) expect(['WEBHOOK', 'MANUAL']).toContain(event.source);
    expect(later.filter((event) => event.source === 'MANUAL').length).toBeGreaterThanOrEqual(3);
  });

  it('respects the shared input limits', () => {
    for (const shipment of DEMO) {
      const { origin, destination, description, weightKg } = shipment;
      const parsed = createShipmentSchema.safeParse({
        clientId: 'x',
        origin,
        destination,
        description,
        weightKg: weightKg ?? undefined,
      });
      expect(parsed.success, shipment.trackingNumber).toBe(true);
      for (const { status, location, note } of shipment.events) {
        expect(createShipmentEventSchema.safeParse({ status, location, note }).success, shipment.trackingNumber).toBe(
          true,
        );
      }
    }
  });

  it('is pure and relative to now', () => {
    expect(buildDemoShipments(SEED_NOW)).toEqual(DEMO);
    const later = buildDemoShipments(new Date(SEED_NOW.getTime() + HOUR_MS));
    expect(later).toHaveLength(DEMO.length);
    later.forEach((shipment, shipmentIndex) => {
      shipment.events.forEach((event, eventIndex) => {
        expect(event.occurredAt.getTime()).toBe(
          DEMO[shipmentIndex]!.events[eventIndex]!.occurredAt.getTime() + HOUR_MS,
        );
      });
    });
  });
});
