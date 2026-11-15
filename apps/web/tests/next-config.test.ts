// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import nextConfig from '../next.config';

const REWRITE = (origin: string) => [{ source: '/api/v1/:path*', destination: origin + '/api/v1/:path*' }];

describe('next.config', () => {
  it('rewrites /api/v1/* to the configured API origin', async () => {
    vi.stubEnv('API_ORIGIN', 'https://api.example.com');
    expect(await nextConfig.rewrites?.()).toEqual(REWRITE('https://api.example.com'));
  });

  it('rewrites to the default origin when API_ORIGIN is unset outside Vercel', async () => {
    vi.stubEnv('API_ORIGIN', '');
    vi.stubEnv('VERCEL', '');
    expect(await nextConfig.rewrites?.()).toEqual(REWRITE('http://localhost:3001'));
  });

  it('fails on Vercel when API_ORIGIN is unset', async () => {
    vi.stubEnv('API_ORIGIN', '');
    vi.stubEnv('VERCEL', '1');
    await expect(nextConfig.rewrites?.()).rejects.toThrow(/API_ORIGIN is required/);
  });

  it('keeps transpiling the shared package', () => {
    expect(nextConfig.transpilePackages).toEqual(['@shipment-tracker/shared']);
  });
});
