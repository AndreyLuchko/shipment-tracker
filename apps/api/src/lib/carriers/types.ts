import type { IncomingHttpHeaders } from 'node:http';
import type { ShipmentStatus } from '@shipment-tracker/shared';

/** A carrier status update, normalized to the internal model. */
export interface CarrierEvent {
  trackingNumber: string;
  /** Already mapped to the internal status. */
  status: ShipmentStatus;
  occurredAt: Date;
  location?: string;
  note?: string;
}

export interface CarrierAdapter {
  /** Equals `Shipment.carrier` of the shipments this adapter may update. */
  readonly name: string;
  /** Verifies that the request comes from the carrier and normalizes it. Throws `AppError` or `ZodError`. */
  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): CarrierEvent;
  /** Post-MVP, for polling carriers. No MVP adapter implements it. */
  fetchStatus?(trackingNumber: string): Promise<CarrierEvent[]>;
}
