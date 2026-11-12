import { describe, expect, it } from 'vitest';
import {
  MOVEMENT_EVENT_SOURCES,
  SHIPMENTS_PAGE_SIZE,
  SHIPMENT_STATUSES,
  movementEventSourceSchema,
  shipmentDetailSchema,
  shipmentEventSchema,
  shipmentListResponseSchema,
  shipmentResponseSchema,
  shipmentStatusSchema,
  shipmentSummarySchema,
} from '../../src/index.js';

const validEvent = {
  id: 'e1',
  status: 'CREATED',
  location: null,
  note: null,
  source: 'SYSTEM',
  occurredAt: '2026-11-12T08:00:00.000Z',
  createdAt: '2026-11-12T08:00:00.000Z',
};
const validSummary = {
  id: 's1',
  trackingNumber: 'ST-2026-000001',
  client: { id: 'u1', name: 'Olena', email: 'olena@example.com' },
  origin: 'Kyiv, UA',
  destination: 'Lviv, UA',
  description: 'Books',
  weightKg: 12.5,
  status: 'CREATED',
  carrier: 'SIMULATED',
  createdAt: '2026-11-12T08:00:00.000Z',
  updatedAt: '2026-11-12T08:00:00.000Z',
};
const validDetail = {
  ...validSummary,
  events: [validEvent],
  allowedNextStatuses: ['CREATED', 'PICKED_UP', 'EXCEPTION'],
};
const validList = { items: [validSummary], page: 1, pageSize: 20, total: 1, totalPages: 1 };

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): PropertyKey[][] {
  return result.error?.issues.map((issue) => issue.path) ?? [];
}

describe('SHIPMENT_STATUSES / shipmentStatusSchema', () => {
  it('lists the seven statuses in order', () => {
    expect(SHIPMENT_STATUSES).toEqual([
      'CREATED',
      'PICKED_UP',
      'IN_TRANSIT',
      'AT_WAREHOUSE',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'EXCEPTION',
    ]);
  });

  it('has the same options as SHIPMENT_STATUSES', () => {
    expect(shipmentStatusSchema.options).toEqual([...SHIPMENT_STATUSES]);
  });

  it.each(['in_transit', 'LOST', ''])('rejects %j', (value) => {
    expect(shipmentStatusSchema.safeParse(value).success).toBe(false);
  });
});

describe('MOVEMENT_EVENT_SOURCES / movementEventSourceSchema', () => {
  it('lists the three sources in order', () => {
    expect(MOVEMENT_EVENT_SOURCES).toEqual(['WEBHOOK', 'MANUAL', 'SYSTEM']);
  });

  it('rejects an unknown source', () => {
    expect(movementEventSourceSchema.safeParse('CARRIER').success).toBe(false);
  });
});

describe('shipmentEventSchema', () => {
  it('accepts an event with null location and note', () => {
    expect(shipmentEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it('accepts an event with location and note', () => {
    const result = shipmentEventSchema.safeParse({ ...validEvent, location: 'Kyiv depot', note: 'Left at reception' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO occurredAt', () => {
    const result = shipmentEventSchema.safeParse({ ...validEvent, occurredAt: 'yesterday' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['occurredAt']);
  });

  it('rejects a missing location (nullable, not optional)', () => {
    const withoutLocation: Partial<typeof validEvent> = { ...validEvent };
    delete withoutLocation.location;
    const result = shipmentEventSchema.safeParse(withoutLocation);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['location']);
  });
});

describe('shipmentSummarySchema', () => {
  it('accepts a valid summary', () => {
    expect(shipmentSummarySchema.safeParse(validSummary).success).toBe(true);
  });

  it('accepts a null weightKg', () => {
    expect(shipmentSummarySchema.safeParse({ ...validSummary, weightKg: null }).success).toBe(true);
  });

  it('rejects a string weightKg', () => {
    const result = shipmentSummarySchema.safeParse({ ...validSummary, weightKg: '12.5' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['weightKg']);
  });

  it('rejects an unknown status', () => {
    const result = shipmentSummarySchema.safeParse({ ...validSummary, status: 'LOST' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['status']);
  });

  it('strips clientId and client.passwordHash', () => {
    const result = shipmentSummarySchema.safeParse({
      ...validSummary,
      clientId: 'u1',
      client: { ...validSummary.client, passwordHash: 'x' },
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('clientId');
    expect(result.data?.client).not.toHaveProperty('passwordHash');
  });
});

describe('shipmentDetailSchema', () => {
  it('accepts a valid detail', () => {
    expect(shipmentDetailSchema.safeParse(validDetail).success).toBe(true);
  });

  it('requires events and allowedNextStatuses', () => {
    const result = shipmentDetailSchema.safeParse(validSummary);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['events']);
    expect(issuePaths(result)).toContainEqual(['allowedNextStatuses']);
  });

  it('rejects an unknown status in allowedNextStatuses', () => {
    expect(shipmentDetailSchema.safeParse({ ...validDetail, allowedNextStatuses: ['LOST'] }).success).toBe(false);
  });
});

describe('shipmentResponseSchema', () => {
  it('accepts { shipment: detail }', () => {
    expect(shipmentResponseSchema.safeParse({ shipment: validDetail }).success).toBe(true);
  });
});

describe('shipmentListResponseSchema', () => {
  it('accepts a page with one item', () => {
    expect(shipmentListResponseSchema.safeParse(validList).success).toBe(true);
  });

  it('accepts an empty result', () => {
    const result = shipmentListResponseSchema.safeParse({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects page 0', () => {
    const result = shipmentListResponseSchema.safeParse({ ...validList, page: 0 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['page']);
  });
});

describe('SHIPMENTS_PAGE_SIZE', () => {
  it('is 20', () => {
    expect(SHIPMENTS_PAGE_SIZE).toBe(20);
  });
});
