import type { PrismaClient } from '@prisma/client';
import type { CarrierWebhookResponse } from '@shipment-tracker/shared';
import type { CarrierEvent } from '../../lib/carriers/types.js';
import { appendShipmentEvent } from '../shipments/shipment-events.service.js';
import { shipmentNotFound } from '../shipments/shipments.service.js';

export interface CarrierEventOutcome {
  /** `false` for an exact duplicate: nothing was written. */
  created: boolean;
  response: CarrierWebhookResponse;
}

/**
 * Finds the shipment by tracking number **and** carrier (an unknown number and another carrier's shipment are
 * the same `404`) and feeds the event through the M3 pipeline with `source: 'WEBHOOK'`.
 */
export async function recordCarrierEvent(
  prisma: PrismaClient,
  carrier: string,
  event: CarrierEvent,
): Promise<CarrierEventOutcome> {
  const shipment = await prisma.shipment.findFirst({
    where: { trackingNumber: event.trackingNumber, carrier },
    select: { id: true },
  });
  if (shipment === null) {
    throw shipmentNotFound();
  }

  const result = await appendShipmentEvent(prisma, shipment.id, {
    status: event.status,
    source: 'WEBHOOK',
    location: event.location,
    note: event.note,
    occurredAt: event.occurredAt,
  });

  return {
    created: result.created,
    response: {
      trackingNumber: result.shipment.trackingNumber,
      shipmentStatus: result.shipment.status,
      duplicate: !result.created,
    },
  };
}
