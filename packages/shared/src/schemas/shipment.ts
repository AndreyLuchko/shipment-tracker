import { z } from 'zod';
import { SHIPMENTS_MAX_PAGE } from '../constants.ts';
import { userSummarySchema } from './user.ts';

export const SHIPMENT_STATUSES = [
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_WAREHOUSE',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
] as const;

export const shipmentStatusSchema = z.enum(SHIPMENT_STATUSES);
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

/** Named `MovementEventSource`, not `EventSource`: the latter is a DOM global in `apps/web`. */
export const MOVEMENT_EVENT_SOURCES = ['WEBHOOK', 'MANUAL', 'SYSTEM'] as const;

export const movementEventSourceSchema = z.enum(MOVEMENT_EVENT_SOURCES);
export type MovementEventSource = z.infer<typeof movementEventSourceSchema>;

export const shipmentEventSchema = z.object({
  id: z.string(),
  status: shipmentStatusSchema,
  location: z.string().nullable(),
  note: z.string().nullable(),
  source: movementEventSourceSchema,
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

/** A list item. Carries `client` (no `clientId`) and no `events`. */
export const shipmentSummarySchema = z.object({
  id: z.string(),
  trackingNumber: z.string(),
  client: userSummarySchema,
  origin: z.string(),
  destination: z.string(),
  description: z.string(),
  weightKg: z.number().nullable(),
  status: shipmentStatusSchema,
  carrier: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ShipmentSummary = z.infer<typeof shipmentSummarySchema>;

/** The detail: events oldest first, plus the statuses the state machine accepts next. */
export const shipmentDetailSchema = shipmentSummarySchema.extend({
  events: z.array(shipmentEventSchema),
  allowedNextStatuses: z.array(shipmentStatusSchema),
});
export type ShipmentDetail = z.infer<typeof shipmentDetailSchema>;

/** Body of `GET /shipments/:id`, `POST /shipments`, `PATCH /shipments/:id` and `POST /shipments/:id/events`. */
export const shipmentResponseSchema = z.object({
  shipment: shipmentDetailSchema,
});
export type ShipmentResponse = z.infer<typeof shipmentResponseSchema>;

export const shipmentListResponseSchema = z.object({
  items: z.array(shipmentSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type ShipmentListResponse = z.infer<typeof shipmentListResponseSchema>;

// ---------------------------------------------------------------------------
// Request bodies and query strings. Every type below is the parsed output.
// ---------------------------------------------------------------------------

/** Trimmed text of `min`–`max` characters without NUL (Postgres cannot store `\u0000` in `text`). */
function cleanText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !value.includes('\u0000'), { message: 'Must not contain NUL characters' });
}

/** Optional trimmed text of at most `max` characters; empty after trimming parses to `undefined`. */
function optionalCleanText(max: number) {
  return cleanText(0, max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();
}

/** A JSON number (no coercion from strings), > 0 and ≤ 100 000. */
const weightKgSchema = z.number().positive().max(100_000);

/** Body of `POST /shipments`. Unknown keys (id, trackingNumber, status, …) are stripped. */
export const createShipmentSchema = z.object({
  clientId: cleanText(1, 64),
  origin: cleanText(1, 200),
  destination: cleanText(1, 200),
  description: cleanText(1, 500),
  weightKg: weightKgSchema.optional(),
});
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

/** Body of `PATCH /shipments/:id`. Strict: any other key is a `400`; `weightKg: null` clears the weight. */
export const updateShipmentSchema = z
  .strictObject({
    description: cleanText(1, 500).optional(),
    weightKg: weightKgSchema.nullable().optional(),
  })
  .refine((body) => body.description !== undefined || body.weightKg !== undefined, {
    message: 'At least one of description, weightKg is required',
    path: [],
  });
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;

/** Body of `POST /shipments/:id/events`. `source` is set by the server, so it is stripped here. */
export const createShipmentEventSchema = z.object({
  status: shipmentStatusSchema,
  location: optionalCleanText(200),
  note: optionalCleanText(500),
  /** ISO-8601 UTC with `Z` only; defaults to the server time when absent. */
  occurredAt: z.iso.datetime().optional(),
});
export type CreateShipmentEventInput = z.infer<typeof createShipmentEventSchema>;

/** Query string of `GET /shipments`. Values arrive as strings, hence the coercion of `page`. */
export const listShipmentsQuerySchema = z.object({
  status: shipmentStatusSchema.optional(),
  search: optionalCleanText(100),
  page: z.coerce.number().int().min(1).max(SHIPMENTS_MAX_PAGE).default(1),
});
export type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;
