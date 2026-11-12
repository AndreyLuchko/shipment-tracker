import type { Prisma } from '@prisma/client';
import { movementEventSourceSchema, type ShipmentDetail, type ShipmentSummary } from '@shipment-tracker/shared';
import { allowedNextStatuses } from '../../lib/state-machine.js';

/** What every shipment response loads: the client's public face, never the whole user row. */
export const shipmentSummaryInclude = {
  client: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ShipmentInclude;

/** The summary's include plus the timeline, oldest first (C3). */
export const shipmentDetailInclude = {
  ...shipmentSummaryInclude,
  events: { orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ShipmentInclude;

export type ShipmentSummaryRow = Prisma.ShipmentGetPayload<{ include: typeof shipmentSummaryInclude }>;
export type ShipmentDetailRow = Prisma.ShipmentGetPayload<{ include: typeof shipmentDetailInclude }>;

/** The only place a shipment row becomes a list item: `Decimal` → number, `Date` → ISO string, no `clientId`. */
export function toShipmentSummary(row: ShipmentSummaryRow): ShipmentSummary {
  return {
    id: row.id,
    trackingNumber: row.trackingNumber,
    client: { id: row.client.id, name: row.client.name, email: row.client.email },
    origin: row.origin,
    destination: row.destination,
    description: row.description,
    weightKg: row.weightKg?.toNumber() ?? null,
    status: row.status,
    carrier: row.carrier,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The only place a shipment row becomes the detail: the summary plus events and `allowedNextStatuses`. */
export function toShipmentDetail(row: ShipmentDetailRow): ShipmentDetail {
  return {
    ...toShipmentSummary(row),
    events: row.events.map((event) => ({
      id: event.id,
      status: event.status,
      location: event.location,
      note: event.note,
      // `source` is a plain string column; narrow it to the contract's enum.
      source: movementEventSourceSchema.parse(event.source),
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
    })),
    allowedNextStatuses: allowedNextStatuses(row.status),
  };
}
