import { z } from 'zod';
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
