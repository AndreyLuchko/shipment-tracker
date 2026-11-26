import { describe, expect, it } from 'vitest';

import { siteUrl } from '@/lib/site-url';

describe('siteUrl', () => {
  it('uses the Vercel production host over https', () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'shipment-tracker.vercel.app' })).toBe(
      'https://shipment-tracker.vercel.app',
    );
  });

  it('falls back to localhost when the variable is missing', () => {
    expect(siteUrl({})).toBe('http://localhost:3000');
  });

  it('falls back to localhost when the variable is empty', () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: '' })).toBe('http://localhost:3000');
  });
});
