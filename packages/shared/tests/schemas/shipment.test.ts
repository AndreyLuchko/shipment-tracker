import { describe, expect, it } from 'vitest';
import {
  MOVEMENT_EVENT_SOURCES,
  SHIPMENTS_MAX_PAGE,
  SHIPMENTS_PAGE_SIZE,
  SHIPMENT_STATUSES,
  createShipmentEventSchema,
  createShipmentSchema,
  listShipmentsQuerySchema,
  movementEventSourceSchema,
  shipmentDetailSchema,
  shipmentEventSchema,
  shipmentListResponseSchema,
  shipmentResponseSchema,
  shipmentStatusSchema,
  shipmentSummarySchema,
  updateShipmentSchema,
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

const validCreate = { clientId: 'c1', origin: ' Kyiv, UA ', destination: 'Lviv, UA', description: ' Books ' };

describe('createShipmentSchema', () => {
  it('trims the text fields and omits an absent weightKg', () => {
    const result = createShipmentSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ clientId: 'c1', origin: 'Kyiv, UA', destination: 'Lviv, UA', description: 'Books' });
    expect(result.data).not.toHaveProperty('weightKg');
  });

  it('accepts a weightKg', () => {
    const result = createShipmentSchema.safeParse({ ...validCreate, weightKg: 12.5 });
    expect(result.success).toBe(true);
    expect(result.data?.weightKg).toBe(12.5);
  });

  it('reports every required field of an empty body', () => {
    const result = createShipmentSchema.safeParse({});
    expect(result.success).toBe(false);
    const paths = issuePaths(result);
    for (const field of ['clientId', 'origin', 'destination', 'description']) {
      expect(paths).toContainEqual([field]);
    }
  });

  it.each([0, -1, 100000.01, '12', null])('rejects weightKg %j', (weightKg) => {
    const result = createShipmentSchema.safeParse({ ...validCreate, weightKg });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['weightKg']);
  });

  it('accepts weightKg 100000', () => {
    expect(createShipmentSchema.safeParse({ ...validCreate, weightKg: 100000 }).success).toBe(true);
  });

  it.each([
    ['origin', '   '],
    ['destination', 'x'.repeat(201)],
    ['description', 'x'.repeat(501)],
    ['clientId', 'x'.repeat(65)],
  ])('rejects an invalid %s', (field, value) => {
    const result = createShipmentSchema.safeParse({ ...validCreate, [field]: value });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual([field]);
  });

  it('accepts text at the maximum lengths', () => {
    const result = createShipmentSchema.safeParse({
      ...validCreate,
      origin: 'x'.repeat(200),
      description: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a NUL character', () => {
    const result = createShipmentSchema.safeParse({ ...validCreate, origin: 'Ky\u0000iv' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['origin']);
  });

  it('strips server-owned keys', () => {
    const result = createShipmentSchema.safeParse({
      ...validCreate,
      id: 'forced',
      trackingNumber: 'ST-X',
      status: 'DELIVERED',
      carrier: 'DHL',
    });
    expect(result.success).toBe(true);
    for (const key of ['id', 'trackingNumber', 'status', 'carrier']) {
      expect(result.data).not.toHaveProperty(key);
    }
  });
});

describe('updateShipmentSchema', () => {
  it('trims description', () => {
    const result = updateShipmentSchema.safeParse({ description: ' New text ' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ description: 'New text' });
  });

  it('accepts a weightKg', () => {
    expect(updateShipmentSchema.safeParse({ weightKg: 3.25 }).success).toBe(true);
  });

  it('accepts weightKg null (clears it)', () => {
    const result = updateShipmentSchema.safeParse({ weightKg: null });
    expect(result.success).toBe(true);
    expect(result.data?.weightKg).toBeNull();
  });

  it('rejects an empty body with one root issue', () => {
    const result = updateShipmentSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path).toEqual([]);
    expect(result.error?.issues[0]?.message).toBe('At least one of description, weightKg is required');
  });

  it.each([
    [{ description: 'ok', origin: 'X' }, ['origin']],
    [{ status: 'DELIVERED' }, ['status']],
  ])('rejects the non-editable keys of %j', (input, keys) => {
    const result = updateShipmentSchema.safeParse(input);
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) => candidate.code === 'unrecognized_keys');
    expect(issue).toBeDefined();
    expect(issue && 'keys' in issue ? issue.keys : undefined).toEqual(keys);
  });

  it.each([{ description: '  ' }, { weightKg: 0 }, { weightKg: '5' }])('rejects %j', (input) => {
    expect(updateShipmentSchema.safeParse(input).success).toBe(false);
  });
});

describe('createShipmentEventSchema', () => {
  it('accepts a bare status', () => {
    const result = createShipmentEventSchema.safeParse({ status: 'IN_TRANSIT' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: 'IN_TRANSIT' });
  });

  it('trims location and note and keeps occurredAt', () => {
    const result = createShipmentEventSchema.safeParse({
      status: 'IN_TRANSIT',
      location: ' Kyiv hub ',
      note: ' Scanned ',
      occurredAt: '2026-11-12T10:30:00Z',
    });
    expect(result.success).toBe(true);
    expect(result.data?.location).toBe('Kyiv hub');
    expect(result.data?.note).toBe('Scanned');
    expect(result.data?.occurredAt).toBe('2026-11-12T10:30:00Z');
  });

  it('parses blank location and note to undefined', () => {
    const result = createShipmentEventSchema.safeParse({ status: 'IN_TRANSIT', location: '   ', note: '' });
    expect(result.success).toBe(true);
    expect(result.data?.location).toBeUndefined();
    expect(result.data?.note).toBeUndefined();
  });

  it.each([{}, { status: 'LOST' }])('rejects status of %j', (input) => {
    const result = createShipmentEventSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['status']);
  });

  it.each([
    ['location', 'x'.repeat(201)],
    ['note', 'x'.repeat(501)],
    ['note', 'a\u0000b'],
  ])('rejects an invalid %s', (field, value) => {
    const result = createShipmentEventSchema.safeParse({ status: 'IN_TRANSIT', [field]: value });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual([field]);
  });

  it.each(['2026-11-12 10:30', '2026-11-12T10:30:00+02:00', 'yesterday', 1731407400000])(
    'rejects occurredAt %j',
    (occurredAt) => {
      const result = createShipmentEventSchema.safeParse({ status: 'IN_TRANSIT', occurredAt });
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContainEqual(['occurredAt']);
    },
  );

  it('strips source and id', () => {
    const result = createShipmentEventSchema.safeParse({ status: 'IN_TRANSIT', source: 'WEBHOOK', id: 'x' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('source');
    expect(result.data).not.toHaveProperty('id');
  });
});

describe('listShipmentsQuerySchema', () => {
  it('defaults page to 1 and sort to newest', () => {
    const result = listShipmentsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 1, sort: 'newest' });
  });

  it.each(['newest', 'oldest', 'updated', 'stale'])('parses sort %s as given', (sort) => {
    expect(listShipmentsQuerySchema.parse({ sort })).toEqual({ page: 1, sort });
  });

  it.each(['price', 'NEWEST', ''])('rejects sort %j', (sort) => {
    const result = listShipmentsQuerySchema.safeParse({ sort });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['sort']);
  });

  it('coerces page and trims search', () => {
    const result = listShipmentsQuerySchema.safeParse({ page: '3', status: 'IN_TRANSIT', search: ' kyiv ' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 3, status: 'IN_TRANSIT', search: 'kyiv', sort: 'newest' });
  });

  it('parses a blank search to undefined', () => {
    const result = listShipmentsQuerySchema.safeParse({ search: '   ' });
    expect(result.success).toBe(true);
    expect(result.data?.search).toBeUndefined();
  });

  it.each(['0', '-1', 'abc', '1.5', '', '100001', ['1', '2']])('rejects page %j', (page) => {
    const result = listShipmentsQuerySchema.safeParse({ page });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['page']);
  });

  it('accepts page 100000', () => {
    expect(listShipmentsQuerySchema.safeParse({ page: '100000' }).success).toBe(true);
  });

  it.each(['delivered', '', ['IN_TRANSIT', 'DELIVERED']])('rejects status %j', (status) => {
    const result = listShipmentsQuerySchema.safeParse({ status });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['status']);
  });

  it.each(['x'.repeat(101), 'a\u0000b'])('rejects search %j', (search) => {
    const result = listShipmentsQuerySchema.safeParse({ search });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(['search']);
  });

  it('strips unknown keys', () => {
    const result = listShipmentsQuerySchema.safeParse({ foo: 'bar' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 1, sort: 'newest' });
  });
});

describe('SHIPMENTS_MAX_PAGE', () => {
  it('is 100000', () => {
    expect(SHIPMENTS_MAX_PAGE).toBe(100000);
  });
});

describe('validation messages', () => {
  function messagesAt(
    result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
    field: string,
  ): string[] {
    return result.error?.issues.filter((issue) => issue.path.join('.') === field).map((issue) => issue.message) ?? [];
  }

  it('names each empty required field of createShipmentSchema', () => {
    const result = createShipmentSchema.safeParse({ clientId: '', origin: ' ', destination: '', description: '' });
    expect(result.success).toBe(false);
    expect(messagesAt(result, 'clientId')).toEqual(['Select a client']);
    expect(messagesAt(result, 'origin')).toEqual(['Enter the origin']);
    expect(messagesAt(result, 'destination')).toEqual(['Enter the destination']);
    expect(messagesAt(result, 'description')).toEqual(['Enter a description']);
  });

  it.each([
    ['origin', 201, 'Origin must be at most 200 characters'],
    ['destination', 201, 'Destination must be at most 200 characters'],
    ['description', 501, 'Description must be at most 500 characters'],
  ])('explains a too long %s', (field, length, message) => {
    const result = createShipmentSchema.safeParse({ ...validCreate, [field]: 'x'.repeat(length) });
    expect(messagesAt(result, field)).toEqual([message]);
  });

  it.each([0, -1])('rejects weightKg %j as not greater than 0', (weightKg) => {
    const result = createShipmentSchema.safeParse({ ...validCreate, weightKg });
    expect(messagesAt(result, 'weightKg')).toEqual(['Weight must be greater than 0']);
  });

  it('rejects weightKg above 100000', () => {
    const result = createShipmentSchema.safeParse({ ...validCreate, weightKg: 100000.5 });
    expect(messagesAt(result, 'weightKg')).toEqual(['Weight must be at most 100000 kg']);
  });

  it.each(['12', null, Number.NaN, Infinity])('asks for a number when weightKg is %j', (weightKg) => {
    const result = createShipmentSchema.safeParse({ ...validCreate, weightKg });
    expect(messagesAt(result, 'weightKg')).toEqual(['Enter the weight as a number']);
  });

  it('keeps the NUL message', () => {
    const result = createShipmentSchema.safeParse({ ...validCreate, origin: 'a\u0000b' });
    expect(messagesAt(result, 'origin')).toEqual(['Must not contain NUL characters']);
  });

  it('still accepts a valid body and strips unknown keys', () => {
    const result = createShipmentSchema.safeParse({ ...validCreate, weightKg: 12.5, extra: 1 });
    expect(result.success).toBe(true);
    expect(result.data?.weightKg).toBe(12.5);
    expect(result.data).not.toHaveProperty('extra');
  });

  it('explains an empty and a too long description', () => {
    expect(messagesAt(updateShipmentSchema.safeParse({ description: '' }), 'description')).toEqual([
      'Enter a description',
    ]);
    expect(messagesAt(updateShipmentSchema.safeParse({ description: 'x'.repeat(501) }), 'description')).toEqual([
      'Description must be at most 500 characters',
    ]);
  });

  it('uses the weight messages in updateShipmentSchema', () => {
    expect(messagesAt(updateShipmentSchema.safeParse({ weightKg: 0 }), 'weightKg')).toEqual([
      'Weight must be greater than 0',
    ]);
    expect(messagesAt(updateShipmentSchema.safeParse({ weightKg: 'x' }), 'weightKg')).toEqual([
      'Enter the weight as a number',
    ]);
  });

  it.each(['', 'LOST', undefined, null, 5])('asks to select a status when status is %j', (status) => {
    const result = createShipmentEventSchema.safeParse({ status });
    expect(messagesAt(result, 'status')).toEqual(['Select a status']);
  });

  it('explains a too long location and note', () => {
    const result = createShipmentEventSchema.safeParse({
      status: 'IN_TRANSIT',
      location: 'x'.repeat(201),
      note: 'x'.repeat(501),
    });
    expect(messagesAt(result, 'location')).toEqual(['Location must be at most 200 characters']);
    expect(messagesAt(result, 'note')).toEqual(['Note must be at most 500 characters']);
  });

  it('still trims the event texts and drops empty ones', () => {
    const result = createShipmentEventSchema.safeParse({ status: 'IN_TRANSIT', location: '  ', note: ' hi ' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: 'IN_TRANSIT', note: 'hi' });
  });

  it('keeps the query status message apart from the event one', () => {
    const result = listShipmentsQuerySchema.safeParse({ status: 'LOST' });
    expect(result.success).toBe(false);
    expect(messagesAt(result, 'status')).toHaveLength(1);
    expect(messagesAt(result, 'status')).not.toEqual(['Select a status']);
  });
});
