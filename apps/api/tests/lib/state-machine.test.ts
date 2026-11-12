// apps/api/tests/lib/state-machine.test.ts
import { describe, expect, it } from 'vitest';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@shipment-tracker/shared';
import { allowedNextStatuses, canTransition } from '../../src/lib/state-machine.js';
import { ALL_TRANSITIONS, LEGAL_TRANSITIONS, isLegalTransition } from '../helpers/transitions.js';

describe('canTransition', () => {
  it('is checked against all 49 pairs: 20 legal, 29 illegal', () => {
    expect(ALL_TRANSITIONS).toHaveLength(49);
    expect(LEGAL_TRANSITIONS).toHaveLength(20);
    expect(ALL_TRANSITIONS.filter(([from, to]) => !isLegalTransition(from, to))).toHaveLength(29);
  });

  it.each(ALL_TRANSITIONS)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(isLegalTransition(from, to));
  });

  it('lets nothing leave DELIVERED, not even a self-loop', () => {
    for (const to of SHIPMENT_STATUSES) {
      expect(canTransition('DELIVERED', to)).toBe(false);
    }
  });

  it('never returns to CREATED from another status', () => {
    for (const from of SHIPMENT_STATUSES.filter((status) => status !== 'CREATED')) {
      expect(canTransition(from, 'CREATED')).toBe(false);
    }
  });

  it.each<[ShipmentStatus[]]>([
    [['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']],
    [['CREATED', 'PICKED_UP', 'IN_TRANSIT']],
  ])('accepts the seeded demo history %j (prisma/seed.ts)', (history) => {
    for (let index = 1; index < history.length; index += 1) {
      expect(canTransition(history[index - 1]!, history[index]!)).toBe(true);
    }
  });
});

describe('allowedNextStatuses', () => {
  it.each<[ShipmentStatus, ShipmentStatus[]]>([
    ['CREATED', ['CREATED', 'PICKED_UP', 'EXCEPTION']],
    ['PICKED_UP', ['PICKED_UP', 'IN_TRANSIT', 'EXCEPTION']],
    ['IN_TRANSIT', ['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION']],
    ['AT_WAREHOUSE', ['IN_TRANSIT', 'AT_WAREHOUSE', 'OUT_FOR_DELIVERY', 'EXCEPTION']],
    ['OUT_FOR_DELIVERY', ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION']],
    ['DELIVERED', []],
    ['EXCEPTION', ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'EXCEPTION']],
  ])('%s', (from, expected) => {
    expect(allowedNextStatuses(from)).toEqual(expected);
  });

  it('returns a new array on every call', () => {
    allowedNextStatuses('CREATED').push('DELIVERED');
    expect(allowedNextStatuses('CREATED')).toEqual(['CREATED', 'PICKED_UP', 'EXCEPTION']);
  });
});
