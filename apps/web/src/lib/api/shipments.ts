import {
  DEFAULT_SHIPMENT_SORT,
  type CreateShipmentEventInput,
  type CreateShipmentInput,
  type ListShipmentsQuery,
  type ShipmentDetail,
  type ShipmentListResponse,
  type UpdateShipmentInput,
  shipmentListResponseSchema,
  shipmentResponseSchema,
} from '@shipment-tracker/shared';

import { apiRequest } from '@/lib/api/client';

/** GET /shipments — `page` is always sent; `status` and `search` only when defined, `sort` only when not the default. */
export function fetchShipments(query: ListShipmentsQuery): Promise<ShipmentListResponse> {
  const params = new URLSearchParams();
  if (query.status !== undefined) params.append('status', query.status);
  if (query.search !== undefined) params.append('search', query.search);
  if (query.sort !== DEFAULT_SHIPMENT_SORT) params.append('sort', query.sort);
  params.append('page', String(query.page));
  return apiRequest(`/shipments?${params.toString()}`, {
    schema: shipmentListResponseSchema,
    retryWhenUnavailable: true,
  });
}

/** GET /shipments/:id — `id` is sent as one encoded path segment. */
export async function fetchShipment(id: string): Promise<ShipmentDetail> {
  const { shipment } = await apiRequest(shipmentPath(id), {
    schema: shipmentResponseSchema,
    retryWhenUnavailable: true,
  });
  return shipment;
}

/** POST /shipments → the created shipment with its `CREATED` event. */
export async function createShipment(input: CreateShipmentInput): Promise<ShipmentDetail> {
  const { shipment } = await apiRequest('/shipments', { method: 'POST', body: input, schema: shipmentResponseSchema });
  return shipment;
}

/** POST /shipments/:id/events → the shipment after the event (`201`, or `200` for an exact duplicate). */
export async function addShipmentEvent(id: string, input: CreateShipmentEventInput): Promise<ShipmentDetail> {
  const { shipment } = await apiRequest(`${shipmentPath(id)}/events`, {
    method: 'POST',
    body: input,
    schema: shipmentResponseSchema,
  });
  return shipment;
}

/** PATCH /shipments/:id → the shipment with the changed keys. Not retried: only safe requests are. */
export async function updateShipment(id: string, input: UpdateShipmentInput): Promise<ShipmentDetail> {
  const { shipment } = await apiRequest(shipmentPath(id), {
    method: 'PATCH',
    body: input,
    schema: shipmentResponseSchema,
  });
  return shipment;
}

function shipmentPath(id: string): string {
  return `/shipments/${encodeURIComponent(id)}`;
}
