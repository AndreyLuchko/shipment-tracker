import { describe, expect, it } from 'vitest';

import { changedDetails } from '@/lib/shipments/edit-details';

import { SHIPMENT } from '../../helpers/fixtures';

const SAME = { description: 'Box of spare machine parts', weightKg: 8.2 };

describe('changedDetails', () => {
  it('is null when nothing changed', () => {
    expect(changedDetails(SHIPMENT, SAME)).toBeNull();
  });

  it('compares the description trimmed', () => {
    expect(changedDetails(SHIPMENT, { ...SAME, description: '  Box of spare machine parts  ' })).toBeNull();
  });

  it('returns a changed description only', () => {
    expect(changedDetails(SHIPMENT, { ...SAME, description: 'Two boxes' })).toEqual({ description: 'Two boxes' });
  });

  it('returns a cleared weight as null', () => {
    expect(changedDetails(SHIPMENT, { ...SAME, weightKg: null })).toEqual({ weightKg: null });
  });

  it('returns a weight set on a shipment without one', () => {
    expect(changedDetails({ ...SHIPMENT, weightKg: null }, { ...SAME, weightKg: 12 })).toEqual({ weightKg: 12 });
  });

  it('is null when the weight stays empty', () => {
    expect(changedDetails({ ...SHIPMENT, weightKg: null }, { ...SAME, weightKg: null })).toBeNull();
  });

  it('returns both keys when both changed', () => {
    expect(changedDetails(SHIPMENT, { description: 'Two boxes', weightKg: 12 })).toEqual({
      description: 'Two boxes',
      weightKg: 12,
    });
  });
});
