import { z } from 'zod';
import { createShipmentEventSchema, shipmentStatusSchema } from './shipment.ts';
import { cleanText } from './text.ts';

/**
 * Body of `POST /webhooks/carrier`, after the signature check and `JSON.parse`. `status`, `location` and `note`
 * keep the manual-event rules; `occurredAt` is required (ISO-8601 UTC with `Z` only). Unknown keys are stripped.
 */
export const carrierWebhookPayloadSchema = createShipmentEventSchema.extend({
  trackingNumber: cleanText(1, 64),
  occurredAt: z.iso.datetime(),
});
export type CarrierWebhookPayload = z.infer<typeof carrierWebhookPayloadSchema>;

/** Acknowledgement of `POST /webhooks/carrier`: `201` for a stored event, `200` with `duplicate: true` otherwise. */
export const carrierWebhookResponseSchema = z.object({
  trackingNumber: z.string(),
  shipmentStatus: shipmentStatusSchema,
  duplicate: z.boolean(),
});
export type CarrierWebhookResponse = z.infer<typeof carrierWebhookResponseSchema>;
