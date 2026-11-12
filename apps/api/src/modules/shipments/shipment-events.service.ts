import type { PrismaClient } from '@prisma/client';
import type { ShipmentDetail, ShipmentStatus } from '@shipment-tracker/shared';
import { AppError, validationError } from '../../lib/errors.js';
import { canTransition } from '../../lib/state-machine.js';
import { shipmentDetailInclude, toShipmentDetail } from './shipment.dto.js';
import { shipmentNotFound } from './shipments.service.js';

export interface AppendShipmentEventInput {
  status: ShipmentStatus;
  /** 'SYSTEM' is reserved for the event written at creation. */
  source: 'MANUAL' | 'WEBHOOK';
  location?: string;
  note?: string;
  /** When the movement happened; defaults to the server time of the call. */
  occurredAt?: Date;
}

export interface AppendShipmentEventResult {
  shipment: ShipmentDetail;
  /** `false` when the event was an exact duplicate (same status + `occurredAt`) and nothing was written. */
  created: boolean;
}

/**
 * The single write path for movement events — manual events now, webhooks in M4. The event and the
 * denormalized `Shipment.status` are written in one transaction that first locks the shipment row, so
 * concurrent events on one shipment are serialized and a rejected event leaves no trace.
 */
export async function appendShipmentEvent(
  prisma: PrismaClient,
  shipmentId: string,
  input: AppendShipmentEventInput,
): Promise<AppendShipmentEventResult> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: ShipmentStatus }>>`
      SELECT "id", "status" FROM "Shipment" WHERE "id" = ${shipmentId} FOR UPDATE`;
    const current = rows[0];
    if (current === undefined) {
      throw shipmentNotFound();
    }

    // Taken after the lock is held, so it is never earlier than an event committed before us.
    const now = new Date();
    const occurredAt = input.occurredAt ?? now;

    if (occurredAt.getTime() > now.getTime()) {
      throw validationError('occurredAt', 'occurredAt must not be in the future');
    }

    // Checked before the state machine, so a retry after a status-changing transition is still a 200.
    // `location`, `note` and `source` are not part of the comparison.
    const duplicate = await tx.movementEvent.findFirst({
      where: { shipmentId, status: input.status, occurredAt },
      select: { id: true },
    });
    if (duplicate !== null) {
      const row = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: shipmentDetailInclude });
      return { created: false, shipment: toShipmentDetail(row) };
    }

    if (!canTransition(current.status, input.status)) {
      throw new AppError(
        422,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition from ${current.status} to ${input.status}`,
      );
    }

    // Equal to the latest event is allowed. A request without `occurredAt` cannot fail this: `now` is
    // taken after the lock, so it is never earlier than an already committed event.
    const latest = await tx.movementEvent.findFirst({
      where: { shipmentId },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    if (latest !== null && occurredAt.getTime() < latest.occurredAt.getTime()) {
      throw validationError('occurredAt', 'occurredAt must not be earlier than the latest event');
    }

    await tx.movementEvent.create({
      data: {
        shipmentId,
        status: input.status,
        source: input.source,
        occurredAt,
        location: input.location ?? null,
        note: input.note ?? null,
      },
    });

    // Written on every stored event, self-loops included, so `updatedAt` is the time of the last movement.
    const row = await tx.shipment.update({
      where: { id: shipmentId },
      data: { status: input.status },
      include: shipmentDetailInclude,
    });
    return { created: true, shipment: toShipmentDetail(row) };
  });
}
