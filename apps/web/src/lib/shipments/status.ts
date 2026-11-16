import type { MovementEventSource, ShipmentStatus } from '@shipment-tracker/shared';

/** What a status is called on screen; the key order follows `SHIPMENT_STATUSES`. */
export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: 'Created',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  AT_WAREHOUSE: 'At warehouse',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Exception',
};

/** Where a movement event came from, as shown on the timeline. */
export const SOURCE_LABELS: Record<MovementEventSource, string> = {
  WEBHOOK: 'Carrier webhook',
  MANUAL: 'Manual update',
  SYSTEM: 'System',
};
