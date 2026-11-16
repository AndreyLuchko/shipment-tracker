// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { formatDateTime, formatRelativeTime, formatWeight } from '@/lib/format';

import { NOW } from '../helpers/fixtures';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

describe('test environment', () => {
  it('runs in UTC', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
  });
});

describe('formatRelativeTime', () => {
  it.each([0, 59 * S, -5 * S])('reads "just now" for an age of %i ms', (x) => {
    expect(formatRelativeTime(ago(x), NOW)).toBe('just now');
  });

  it.each([
    [60 * S, '1 minute ago'],
    [90 * S, '1 minute ago'],
    [59 * M, '59 minutes ago'],
    [60 * M, '1 hour ago'],
    [24 * H - M, '23 hours ago'],
    [24 * H, '1 day ago'],
    [29 * D, '29 days ago'],
    [30 * D, '1 month ago'],
    [106 * D, '3 months ago'],
    [364 * D, '12 months ago'],
    [365 * D, '1 year ago'],
    [800 * D, '2 years ago'],
  ])('reads an age of %i ms as "%s"', (x, expected) => {
    expect(formatRelativeTime(ago(x), NOW)).toBe(expected);
  });

  it('measures from the current time by default', () => {
    vi.setSystemTime(NOW);

    expect(formatRelativeTime('2026-11-15T10:00:00.000Z')).toBe('2 hours ago');
  });
});

describe('formatDateTime', () => {
  it('formats the medium date and short time', () => {
    expect(formatDateTime('2026-08-02T10:00:00.000Z')).toBe('2 Aug 2026, 10:00');
    expect(formatDateTime('2026-11-15T23:30:00.000Z')).toBe('15 Nov 2026, 23:30');
  });
});

describe('formatWeight', () => {
  it('formats a weight in kilograms, or a dash without one', () => {
    expect(formatWeight(8.2)).toBe('8.2 kg');
    expect(formatWeight(120.5)).toBe('120.5 kg');
    expect(formatWeight(100000)).toBe('100000 kg');
    expect(formatWeight(null)).toBe('—');
  });
});
