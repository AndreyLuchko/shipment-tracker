import type { NextConfig } from 'next';

import { resolveApiOrigin } from './src/lib/api-origin';

const nextConfig: NextConfig = {
  transpilePackages: ['@shipment-tracker/shared'],
  // Same-origin API (spec §7): the browser calls /api/v1/* on the frontend's host and Next.js proxies it, so
  // the API's cookies belong to this host and no CORS is involved. The env is read here, not at module load,
  // so importing the config never throws.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${resolveApiOrigin(process.env)}/api/v1/:path*` }];
  },
};

export default nextConfig;
