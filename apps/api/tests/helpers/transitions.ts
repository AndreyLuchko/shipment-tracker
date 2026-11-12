// apps/api/tests/helpers/transitions.ts
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@shipment-tracker/shared';

/** Every legal pair, written out by hand from spec §6. Anything not listed here must be rejected. */
export const LEGAL_TRANSITIONS: Array<[ShipmentStatus, ShipmentStatus]> = [
  ['CREATED', 'CREATED'],
  ['CREATED', 'PICKED_UP'],
  ['CREATED', 'EXCEPTION'],
  ['PICKED_UP', 'PICKED_UP'],
  ['PICKED_UP', 'IN_TRANSIT'],
  ['PICKED_UP', 'EXCEPTION'],
  ['IN_TRANSIT', 'IN_TRANSIT'],
  ['IN_TRANSIT', 'AT_WAREHOUSE'],
  ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
  ['IN_TRANSIT', 'EXCEPTION'],
  ['AT_WAREHOUSE', 'AT_WAREHOUSE'],
  ['AT_WAREHOUSE', 'IN_TRANSIT'],
  ['AT_WAREHOUSE', 'OUT_FOR_DELIVERY'],
  ['AT_WAREHOUSE', 'EXCEPTION'],
  ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
  ['OUT_FOR_DELIVERY', 'DELIVERED'],
  ['OUT_FOR_DELIVERY', 'EXCEPTION'],
  ['EXCEPTION', 'EXCEPTION'],
  ['EXCEPTION', 'IN_TRANSIT'],
  ['EXCEPTION', 'OUT_FOR_DELIVERY'],
];

const legalKeys = new Set(LEGAL_TRANSITIONS.map(([from, to]) => `${from}->${to}`));

/** All 49 ordered pairs of statuses. */
export const ALL_TRANSITIONS: Array<[ShipmentStatus, ShipmentStatus]> = SHIPMENT_STATUSES.flatMap((from) =>
  SHIPMENT_STATUSES.map((to): [ShipmentStatus, ShipmentStatus] => [from, to]),
);

export function isLegalTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return legalKeys.has(`${from}->${to}`);
}
