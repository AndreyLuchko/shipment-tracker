import { z } from 'zod';
import { SHIPMENTS_MAX_PAGE } from '../constants.ts';
import { cleanText, optionalCleanText } from './text.ts';
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

/** A JSON number (no coercion from strings), > 0 and ≤ 100 000. */
const weightKgSchema = z
  .number('Enter the weight as a number')
  .positive('Weight must be greater than 0')
  .max(100_000, 'Weight must be at most 100000 kg');

/** Body of `POST /shipments`. Unknown keys (id, trackingNumber, status, …) are stripped. */
export const createShipmentSchema = z.object({
  clientId: cleanText(1, 64, { min: 'Select a client' }),
  origin: cleanText(1, 200, { min: 'Enter the origin', max: 'Origin must be at most 200 characters' }),
  destination: cleanText(1, 200, { min: 'Enter the destination', max: 'Destination must be at most 200 characters' }),
  description: cleanText(1, 500, { min: 'Enter a description', max: 'Description must be at most 500 characters' }),
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
  /** Its own enum (not `shipmentStatusSchema`) so only the form-facing schemas carry the message. */
  status: z.enum(SHIPMENT_STATUSES, 'Select a status'),
  location: optionalCleanText(200, 'Location must be at most 200 characters'),
  note: optionalCleanText(500, 'Note must be at most 500 characters'),
  /** ISO-8601 UTC with `Z` only; defaults to the server time when absent. */
  occurredAt: z.iso.datetime().optional(),
});
export type CreateShipmentEventInput = z.infer<typeof createShipmentEventSchema>;

/** List orders: by creation (`newest`, `oldest`) or by last movement (`updated`, `stale` = least recently moved). */
export const SHIPMENT_SORTS = ['newest', 'oldest', 'updated', 'stale'] as const;

export const shipmentSortSchema = z.enum(SHIPMENT_SORTS);
export type ShipmentSort = z.infer<typeof shipmentSortSchema>;

export const DEFAULT_SHIPMENT_SORT: ShipmentSort = 'newest';

/** Query string of `GET /shipments`. Values arrive as strings, hence the coercion of `page`. */
export const listShipmentsQuerySchema = z.object({
  status: shipmentStatusSchema.optional(),
  search: optionalCleanText(100),
  page: z.coerce.number().int().min(1).max(SHIPMENTS_MAX_PAGE).default(1),
  sort: shipmentSortSchema.default(DEFAULT_SHIPMENT_SORT),
});
export type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;
