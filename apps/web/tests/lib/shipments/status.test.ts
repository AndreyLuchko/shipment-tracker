// @vitest-environment node
import { SHIPMENT_STATUSES } from '@shipment-tracker/shared';
import { describe, expect, it } from 'vitest';

import { SOURCE_LABELS, STATUS_LABELS } from '@/lib/shipments/status';

describe('STATUS_LABELS', () => {
  it('names every status, in the order of SHIPMENT_STATUSES', () => {
    expect(STATUS_LABELS).toEqual({
      CREATED: 'Created',
      PICKED_UP: 'Picked up',
      IN_TRANSIT: 'In transit',
      AT_WAREHOUSE: 'At warehouse',
      OUT_FOR_DELIVERY: 'Out for delivery',
      DELIVERED: 'Delivered',
      EXCEPTION: 'Exception',
    });
    expect(Object.keys(STATUS_LABELS)).toEqual([...SHIPMENT_STATUSES]);
  });
});

describe('SOURCE_LABELS', () => {
  it('names every event source', () => {
    expect(SOURCE_LABELS).toEqual({ WEBHOOK: 'Carrier webhook', MANUAL: 'Manual update', SYSTEM: 'System' });
  });
});
