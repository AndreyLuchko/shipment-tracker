import { describe, expect, it } from 'vitest';
import { carrierWebhookPayloadSchema, carrierWebhookResponseSchema } from '../../src/index.js';
import * as shared from '../../src/index.js';

const validPayload = {
  trackingNumber: 'ST-2026-000123',
  status: 'IN_TRANSIT',
  location: 'Kyiv sorting hub',
  occurredAt: '2026-07-15T10:30:00Z',
};
const validResponse = { trackingNumber: 'ST-2026-000123', shipmentStatus: 'IN_TRANSIT', duplicate: false };

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): PropertyKey[][] {
  return result.error?.issues.map((issue) => issue.path) ?? [];
}

describe('carrierWebhookPayloadSchema', () => {
  it('accepts the spec example unchanged', () => {
    const result = carrierWebhookPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validPayload);
  });

  it('trims trackingNumber, location and note', () => {
    const result = carrierWebhookPayloadSchema.safeParse({
      ...validPayload,
      trackingNumber: ' ST-2026-000123 ',
      location: ' Kyiv hub ',
      note: ' Left at reception ',
    });
    expect(result.success).toBe(true);
    expect(result.data?.trackingNumber).toBe('ST-2026-000123');
    expect(result.data?.location).toBe('Kyiv hub');
    expect(result.data?.note).toBe('Left at reception');
  });

  it('accepts a payload without location and note', () => {
    const { trackingNumber, status, occurredAt } = validPayload;
    const result = carrierWebhookPayloadSchema.safeParse({ trackingNumber, status, occurredAt });
    expect(result.success).toBe(true);
    expect(result.data?.location).toBeUndefined();
    expect(result.data?.note).toBeUndefined();
  });

  it('accepts occurredAt with milliseconds', () => {
    const result = carrierWebhookPayloadSchema.safeParse({ ...validPayload, occurredAt: '2026-07-15T10:30:00.000Z' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty object with issues on trackingNumber, status and occurredAt', () => {
    const paths = issuePaths(carrierWebhookPayloadSchema.safeParse({}));
    expect(paths).toContainEqual(['trackingNumber']);
    expect(paths).toContainEqual(['status']);
    expect(paths).toContainEqual(['occurredAt']);
  });

  it('requires occurredAt (unlike a manual event)', () => {
    const { trackingNumber, status, location } = validPayload;
    const result = carrierWebhookPayloadSchema.safeParse({ trackingNumber, status, location });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([['occurredAt']]);
  });

  it.each(['2026-07-15 10:30', '2026-07-15T10:30:00+02:00', 'yesterday', 1752575400000])(
    'rejects occurredAt %j',
    (occurredAt) => {
      const result = carrierWebhookPayloadSchema.safeParse({ ...validPayload, occurredAt });
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toEqual([['occurredAt']]);
    },
  );

  it.each(['', '   ', 'x'.repeat(65), 'a\u0000b', 123, null])('rejects trackingNumber %j', (trackingNumber) => {
    const result = carrierWebhookPayloadSchema.safeParse({ ...validPayload, trackingNumber });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([['trackingNumber']]);
  });

  it.each(['x'.repeat(64), 'any format 42'])('accepts trackingNumber %j', (trackingNumber) => {
    expect(carrierWebhookPayloadSchema.safeParse({ ...validPayload, trackingNumber }).success).toBe(true);
  });

  it.each(['LOST', 'in_transit', ''])('rejects status %j', (status) => {
    const result = carrierWebhookPayloadSchema.safeParse({ ...validPayload, status });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([['status']]);
  });

  it.each([
    ['location', 'x'.repeat(201)],
    ['note', 'x'.repeat(501)],
    ['note', 'a\u0000b'],
    ['location', null],
    ['note', null],
    ['location', 5],
  ])('rejects %s = %j', (field, value) => {
    const result = carrierWebhookPayloadSchema.safeParse({ ...validPayload, [field]: value });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([[field]]);
  });

  it('parses blank location and note to undefined', () => {
    const result = carrierWebhookPayloadSchema.safeParse({ ...validPayload, location: '   ', note: '' });
    expect(result.success).toBe(true);
    expect(result.data?.location).toBeUndefined();
    expect(result.data?.note).toBeUndefined();
  });

  it('strips unknown keys', () => {
    const result = carrierWebhookPayloadSchema.safeParse({
      ...validPayload,
      source: 'MANUAL',
      id: 'forced',
      carrier: 'DHL',
      shipmentId: 's1',
      createdAt: '2000-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    for (const key of ['source', 'id', 'carrier', 'shipmentId', 'createdAt']) {
      expect(result.data).not.toHaveProperty(key);
    }
  });

  it.each([[[]], [null], ['text'], [42]])('rejects a non-object body %j', (body) => {
    expect(carrierWebhookPayloadSchema.safeParse(body).success).toBe(false);
  });
});

describe('carrierWebhookResponseSchema', () => {
  it('accepts a stored-event acknowledgement', () => {
    expect(carrierWebhookResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it('accepts a duplicate acknowledgement', () => {
    expect(carrierWebhookResponseSchema.safeParse({ ...validResponse, duplicate: true }).success).toBe(true);
  });

  it('strips anything beyond the three fields', () => {
    const result = carrierWebhookResponseSchema.safeParse({
      ...validResponse,
      shipment: { id: 's1' },
      client: { email: 'a@b.c' },
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validResponse);
  });

  it.each([
    ['duplicate', undefined],
    ['shipmentStatus', 'LOST'],
    ['duplicate', 'no'],
  ])('rejects %s = %j', (field, value) => {
    const body: Record<string, unknown> = { ...validResponse, [field]: value };
    if (value === undefined) delete body[field];
    const result = carrierWebhookResponseSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual([[field]]);
  });
});

describe('package exports', () => {
  it('does not expose the internal text helpers', () => {
    expect('cleanText' in shared).toBe(false);
    expect('optionalCleanText' in shared).toBe(false);
  });
});
