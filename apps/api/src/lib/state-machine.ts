import { SHIPMENT_STATUSES, type ShipmentStatus } from '@shipment-tracker/shared';

/**
 * Legal next statuses per status (spec §6). Every non-terminal status may repeat itself (a second scan at
 * another hub); `DELIVERED` is terminal. The `Record` type forces an entry for every status.
 */
const TRANSITIONS: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  CREATED: ['CREATED', 'PICKED_UP', 'EXCEPTION'],
  PICKED_UP: ['PICKED_UP', 'IN_TRANSIT', 'EXCEPTION'],
  IN_TRANSIT: ['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION'],
  AT_WAREHOUSE: ['AT_WAREHOUSE', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
  DELIVERED: [],
  EXCEPTION: ['EXCEPTION', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'],
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Every status reachable from `from`, in `SHIPMENT_STATUSES` order, as a new array on every call. */
export function allowedNextStatuses(from: ShipmentStatus): ShipmentStatus[] {
  return SHIPMENT_STATUSES.filter((to) => canTransition(from, to));
}
