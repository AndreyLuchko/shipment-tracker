import type {
  PublicUser,
  ShipmentDetail,
  ShipmentEvent,
  ShipmentListResponse,
  ShipmentSummary,
  UserSummary,
} from '@shipment-tracker/shared';

export const USER: PublicUser = {
  id: 'u1',
  email: 'client@demo.dev',
  name: 'Demo Client',
  role: 'CLIENT',
  createdAt: '2026-11-13T10:00:00.000Z',
};

export const DISPATCHER: PublicUser = {
  id: 'u2',
  email: 'dispatcher@demo.dev',
  name: 'Demo Dispatcher',
  role: 'DISPATCHER',
  createdAt: '2026-11-13T10:00:00.000Z',
};

/** The test clock: `vi.setSystemTime(NOW)`. */
export const NOW = new Date('2026-11-15T12:00:00.000Z');

export const CLIENT_SUMMARY: UserSummary = { id: 'u1', name: 'Demo Client', email: 'client@demo.dev' };

export const OTHER_CLIENT: UserSummary = { id: 'u3', name: 'Acme Logistics', email: 'acme@example.com' };

/** Ordered by name, as the API returns them. */
export const CLIENTS: UserSummary[] = [OTHER_CLIENT, CLIENT_SUMMARY];

/** Oldest first, as the API returns them. */
export const EVENTS: ShipmentEvent[] = [
  {
    id: 'e1',
    status: 'CREATED',
    location: null,
    note: null,
    source: 'SYSTEM',
    occurredAt: '2026-11-14T08:00:00.000Z',
    createdAt: '2026-11-14T08:00:00.000Z',
  },
  {
    id: 'e2',
    status: 'PICKED_UP',
    location: 'Odesa depot',
    note: null,
    source: 'WEBHOOK',
    occurredAt: '2026-11-14T11:00:00.000Z',
    createdAt: '2026-11-14T11:00:00.000Z',
  },
  {
    id: 'e3',
    status: 'IN_TRANSIT',
    location: 'Dnipro sorting hub',
    note: 'Left the hub on time',
    source: 'MANUAL',
    occurredAt: '2026-11-15T10:00:00.000Z',
    createdAt: '2026-11-15T10:00:00.000Z',
  },
];

export const SHIPMENT: ShipmentSummary = {
  id: 'shp1',
  trackingNumber: 'ST-2026-000002',
  client: CLIENT_SUMMARY,
  origin: 'Odesa, UA',
  destination: 'Kharkiv, UA',
  description: 'Box of spare machine parts',
  weightKg: 8.2,
  status: 'IN_TRANSIT',
  carrier: 'SIMULATED',
  createdAt: '2026-11-14T08:00:00.000Z',
  updatedAt: '2026-11-15T10:00:00.000Z',
};

export const EXCEPTION_SHIPMENT: ShipmentSummary = {
  ...SHIPMENT,
  id: 'shp2',
  trackingNumber: 'ST-2026-000003',
  client: OTHER_CLIENT,
  origin: 'Kyiv, UA',
  destination: 'Lviv, UA',
  description: 'Pallet of packaged electronics',
  weightKg: null,
  status: 'EXCEPTION',
  updatedAt: '2026-11-15T11:30:00.000Z',
};

export const SHIPMENT_DETAIL: ShipmentDetail = {
  ...SHIPMENT,
  events: EVENTS,
  allowedNextStatuses: ['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION'],
};

export const NEW_EVENT: ShipmentEvent = {
  id: 'e4',
  status: 'AT_WAREHOUSE',
  location: 'Kharkiv hub',
  note: null,
  source: 'MANUAL',
  occurredAt: '2026-11-15T11:55:00.000Z',
  createdAt: '2026-11-15T11:55:00.000Z',
};

/** The allowed statuses of `AT_WAREHOUSE` equal those of `IN_TRANSIT`. */
export const SHIPMENT_AFTER_EVENT: ShipmentDetail = {
  ...SHIPMENT_DETAIL,
  status: 'AT_WAREHOUSE',
  updatedAt: '2026-11-15T11:55:00.000Z',
  events: [...EVENTS, NEW_EVENT],
};

export const DELIVERED_DETAIL: ShipmentDetail = {
  ...SHIPMENT_DETAIL,
  id: 'shp3',
  trackingNumber: 'ST-2026-000001',
  status: 'DELIVERED',
  allowedNextStatuses: [],
};

/** One page of `GET /shipments` with the API's page size of 20. */
export function listPage(
  items: ShipmentSummary[],
  { page = 1, total = items.length }: { page?: number; total?: number } = {},
): ShipmentListResponse {
  return { items, page, pageSize: 20, total, totalPages: Math.ceil(total / 20) };
}
