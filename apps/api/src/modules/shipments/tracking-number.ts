import type { Prisma } from '@prisma/client';

/** The highest sequence a year can hold: `ST-<year>-999999` (C11 — unreachable in the MVP). */
export const TRACKING_NUMBER_MAX_SEQUENCE = 999_999;

/** Key of the transaction-scoped advisory lock that serializes tracking-number allocation (D14). */
const TRACKING_NUMBER_LOCK_KEY = 728_301;

/** Builds `ST-<year>-<sequence padded to 6 digits>`; throws unless `sequence` is an integer in 1…999 999. */
export function formatTrackingNumber(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > TRACKING_NUMBER_MAX_SEQUENCE) {
    throw new RangeError(`Tracking number sequence out of range: ${sequence}`);
  }
  return `ST-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Returns the next free tracking number of the UTC year of `now`: the highest existing sequence + 1 (D14).
 *
 * Must be called inside the interactive transaction that also inserts the shipment — the advisory lock is
 * released when that transaction ends, so a concurrent create waits until this one's row is visible.
 */
export async function nextTrackingNumber(tx: Prisma.TransactionClient, now: Date = new Date()): Promise<string> {
  // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns `void`, which $queryRaw cannot deserialize.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TRACKING_NUMBER_LOCK_KEY})`;

  const year = now.getUTCFullYear();
  const pattern = `^ST-${year}-[0-9]{6}$`;
  const rows = await tx.$queryRaw<Array<{ max: number }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("trackingNumber" FROM 9) AS INTEGER)), 0) AS max
    FROM "Shipment"
    WHERE "trackingNumber" ~ ${pattern}`;

  return formatTrackingNumber(year, (rows[0]?.max ?? 0) + 1);
}
