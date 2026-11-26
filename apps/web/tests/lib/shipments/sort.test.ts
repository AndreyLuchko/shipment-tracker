// @vitest-environment node
import { SHIPMENT_SORTS } from '@shipment-tracker/shared';
import { describe, expect, it } from 'vitest';

import { SORT_LABELS } from '@/lib/shipments/sort';

describe('SORT_LABELS', () => {
  it('names every sort, in the order of SHIPMENT_SORTS', () => {
    expect(SORT_LABELS).toEqual({
      newest: 'Newest first',
      oldest: 'Oldest first',
      updated: 'Recently updated',
      stale: 'Least recently updated',
    });
    expect(Object.keys(SORT_LABELS)).toEqual([...SHIPMENT_SORTS]);
  });
});
