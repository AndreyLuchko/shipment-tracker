import type { ShipmentSort } from '@shipment-tracker/shared';

/** What a sort is called on screen; the key order follows `SHIPMENT_SORTS`. */
export const SORT_LABELS: Record<ShipmentSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  updated: 'Recently updated',
  stale: 'Least recently updated',
};
