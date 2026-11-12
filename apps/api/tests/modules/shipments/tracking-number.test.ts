import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TRACKING_NUMBER_MAX_SEQUENCE,
  formatTrackingNumber,
  nextTrackingNumber,
} from '../../../src/modules/shipments/tracking-number.js';
import { buildTestApp } from '../../helpers/app.js';
import { registerTestUser, type TestSession } from '../../helpers/auth.js';
import { resetDb } from '../../helpers/db.js';
import { createTestShipment } from '../../helpers/shipments.js';

const YEAR = new Date().getUTCFullYear();
const NOW = new Date('2026-11-12T10:00:00.000Z');

describe('formatTrackingNumber', () => {
  it('exposes the maximum sequence', () => {
    expect(TRACKING_NUMBER_MAX_SEQUENCE).toBe(999_999);
  });

  it.each([
    [2026, 1, 'ST-2026-000001'],
    [2026, 123, 'ST-2026-000123'],
    [2027, 999_999, 'ST-2027-999999'],
  ])('formats (%i, %i) as %s', (year, sequence, expected) => {
    expect(formatTrackingNumber(year, sequence)).toBe(expected);
  });

  it.each([0, -5, 1.5, 1_000_000])('throws RangeError for sequence %d', (sequence) => {
    expect(() => formatTrackingNumber(2026, sequence)).toThrow(RangeError);
  });
});

describe('nextTrackingNumber', () => {
  let app: FastifyInstance;
  let client: TestSession;

  const next = (now?: Date): Promise<string> => app.prisma.$transaction((tx) => nextTrackingNumber(tx, now));

  const existing = async (...trackingNumbers: string[]): Promise<void> => {
    for (const trackingNumber of trackingNumbers) {
      await createTestShipment(app.prisma, client.user.id, { trackingNumber });
    }
  };

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    client = await registerTestUser(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts at 000001 when no shipment exists', async () => {
    await expect(next(NOW)).resolves.toBe('ST-2026-000001');
  });

  it('continues after the seeded numbers', async () => {
    await existing('ST-2026-000001', 'ST-2026-000002');
    await expect(next(NOW)).resolves.toBe('ST-2026-000003');
  });

  it('takes the highest number + 1 and does not refill gaps', async () => {
    await existing('ST-2026-000007');
    await expect(next(NOW)).resolves.toBe('ST-2026-000008');
  });

  it('ignores numbers of another year', async () => {
    await existing('ST-2025-000050');
    await expect(next(NOW)).resolves.toBe('ST-2026-000001');
  });

  it('ignores numbers that do not match the format', async () => {
    await existing('ST-2026-000004', 'ST-2026-ABC', 'ST-2026-1234567', 'ST-TEST-1', 'XX-2026-000900');
    await expect(next(NOW)).resolves.toBe('ST-2026-000005');
  });

  it('uses the UTC year on the last millisecond of the year', async () => {
    await existing('ST-2026-000009');
    await expect(next(new Date('2026-12-31T23:59:59.999Z'))).resolves.toBe('ST-2026-000010');
  });

  it('restarts the sequence on the first millisecond of the next year', async () => {
    await existing('ST-2026-000009');
    await expect(next(new Date('2027-01-01T00:00:00.000Z'))).resolves.toBe('ST-2027-000001');
  });

  it('rejects with RangeError when the year is exhausted', async () => {
    await existing('ST-2026-999999');
    await expect(next(NOW)).rejects.toThrow(RangeError);
  });

  it('defaults now to the current time', async () => {
    const result = await next();
    expect(result).toMatch(/^ST-\d{4}-000001$/);
    expect(result.slice(3, 7)).toBe(String(YEAR));
  });
});
