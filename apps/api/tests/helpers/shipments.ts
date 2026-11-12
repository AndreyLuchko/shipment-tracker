import { randomUUID } from 'node:crypto';
import type { PrismaClient, Shipment } from '@prisma/client';
import type { MovementEventSource, ShipmentStatus } from '@shipment-tracker/shared';

export interface TestEventInput {
  status: ShipmentStatus;
  occurredAt: Date;
  location?: string;
  note?: string;
  /** Defaults to 'WEBHOOK'. */
  source?: MovementEventSource;
}

export interface TestShipmentOptions {
  /** Defaults to 'CREATED'. */
  status?: ShipmentStatus;
  /** Defaults to `ST-TEST-<randomUUID>` — never matches the real `ST-<year>-<6 digits>` format. */
  trackingNumber?: string;
  /** Defaults: 'Kyiv, UA', 'Lviv, UA', 'Test parcel', null. */
  origin?: string;
  destination?: string;
  description?: string;
  weightKg?: number | null;
  /** Defaults to the database default (now). */
  createdAt?: Date;
  /** Replaces the default events; the caller keeps them consistent with `status`. */
  events?: TestEventInput[];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The default timeline: `CREATED` (SYSTEM) at now − 3 h and, unless `status` is `CREATED`, one `status` event
 * (WEBHOOK) at now − 2 h — so every default fixture's latest event is at least two hours old.
 */
function defaultEvents(status: ShipmentStatus): TestEventInput[] {
  const now = Date.now();
  const events: TestEventInput[] = [{ status: 'CREATED', occurredAt: new Date(now - 3 * HOUR_MS), source: 'SYSTEM' }];
  if (status !== 'CREATED') {
    events.push({ status, occurredAt: new Date(now - 2 * HOUR_MS), source: 'WEBHOOK' });
  }
  return events;
}

/** Inserts a shipment owned by `clientId`, with its events, directly through Prisma. Returns the shipment row. */
export async function createTestShipment(
  prisma: PrismaClient,
  clientId: string,
  options: TestShipmentOptions = {},
): Promise<Shipment> {
  const status = options.status ?? 'CREATED';
  const events = options.events ?? defaultEvents(status);

  return prisma.shipment.create({
    data: {
      trackingNumber: options.trackingNumber ?? `ST-TEST-${randomUUID()}`,
      clientId,
      origin: options.origin ?? 'Kyiv, UA',
      destination: options.destination ?? 'Lviv, UA',
      description: options.description ?? 'Test parcel',
      weightKg: options.weightKg ?? null,
      status,
      ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
      events: {
        create: events.map((event) => ({
          status: event.status,
          occurredAt: event.occurredAt,
          location: event.location ?? null,
          note: event.note ?? null,
          source: event.source ?? 'WEBHOOK',
        })),
      },
    },
  });
}
