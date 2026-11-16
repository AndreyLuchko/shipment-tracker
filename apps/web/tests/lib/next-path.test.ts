// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { DEFAULT_AFTER_LOGIN, loginHref, safeNextPath } from '@/lib/next-path';

describe('safeNextPath', () => {
  it.each([null, undefined, ''])('falls back to /shipments for %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/shipments');
  });

  it.each([
    '/shipments',
    '/shipments/abc',
    '/shipments?page=2',
    '/shipments/new',
    '/shipments?status=EXCEPTION&search=kyiv+hub&page=2',
  ])('accepts %j as it is', (raw) => {
    expect(safeNextPath(raw)).toBe(raw);
  });

  it('drops the hash', () => {
    expect(safeNextPath('/shipments/abc?tab=x#frag')).toBe('/shipments/abc?tab=x');
  });

  it.each(['/shipmentsX', '/login', '/register', '/', '/api/v1/auth/logout'])(
    'falls back to /shipments for a page outside /shipments: %j',
    (raw) => {
      expect(safeNextPath(raw)).toBe('/shipments');
    },
  );

  it.each([
    '//evil.com',
    '///evil.com',
    'https://evil.com',
    'https://evil.com/shipments',
    '\\\\evil.com',
    'javascript:alert(1)',
    'http://n.evil.com/shipments',
  ])('falls back to /shipments for another origin: %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/shipments');
  });

  it.each(['/shipments/../login', '/shipments/..', '/shipments/%2e%2e/login'])(
    'normalizes the path before checking it: %j',
    (raw) => {
      expect(safeNextPath(raw)).toBe('/shipments');
    },
  );

  it('normalizes a backslash to a slash on the same origin', () => {
    expect(safeNextPath('/shipments\\evil')).toBe('/shipments/evil');
  });

  it('strips a newline', () => {
    expect(safeNextPath('/shipments/a\nb')).toBe('/shipments/ab');
  });
});

describe('loginHref', () => {
  it('is plain /login for the default page', () => {
    expect(loginHref('/shipments')).toBe('/login');
  });

  it('carries a nested page as ?next=', () => {
    expect(loginHref('/shipments/abc')).toBe('/login?next=%2Fshipments%2Fabc');
  });

  it('carries the query, encoded', () => {
    expect(loginHref('/shipments?status=EXCEPTION&page=2')).toBe(
      '/login?next=%2Fshipments%3Fstatus%3DEXCEPTION%26page%3D2',
    );
  });

  it.each(['/', '/login', '//evil.com'])('is plain /login for a target that falls back: %j', (target) => {
    expect(loginHref(target)).toBe('/login');
  });
});

describe('DEFAULT_AFTER_LOGIN', () => {
  it('is /shipments', () => {
    expect(DEFAULT_AFTER_LOGIN).toBe('/shipments');
  });
});
