import type { IncomingHttpHeaders } from 'node:http';
import { CARRIER_SIGNATURE_HEADER_NAME, carrierWebhookPayloadSchema } from '@shipment-tracker/shared';
import { AppError } from '../errors.js';
import { verifySignature } from '../hmac.js';
import type { CarrierAdapter, CarrierEvent } from './types.js';

export const SIMULATED_CARRIER_NAME = 'SIMULATED';

/**
 * The only MVP carrier: events signed with `WEBHOOK_SECRET` (spec §9). The secret lives in a `#private` field,
 * so it shows up in neither `JSON.stringify` nor `util.inspect` (M4 decision C10).
 */
export class SimulatedCarrierAdapter implements CarrierAdapter {
  readonly name = SIMULATED_CARRIER_NAME;
  readonly #secret: string;

  constructor(secret: string) {
    this.#secret = secret;
  }

  /** Signature first, then `JSON.parse`, then Zod — nothing from the body is read before it is authenticated. */
  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): CarrierEvent {
    if (!verifySignature(rawBody, headers[CARRIER_SIGNATURE_HEADER_NAME], this.#secret)) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'Request body is not valid JSON');
    }

    const payload = carrierWebhookPayloadSchema.parse(json);
    return {
      trackingNumber: payload.trackingNumber,
      status: payload.status,
      occurredAt: new Date(payload.occurredAt),
      location: payload.location,
      note: payload.note,
    };
  }
}
