import { type ReactNode, Suspense } from 'react';

import { ShipmentsList } from '@/components/shipments/shipments-list';

/**
 * Rendered per request, not prerendered. Next.js 16.2 seeds its client route cache for a prerendered page with the
 * URL of the first load, query included, and every later soft navigation to `/shipments` writes that URL back to the
 * address bar: after loading `/shipments?search=kyiv`, no search, filter, sort or page change could leave it (19f).
 * Re-check this after a Next.js upgrade, and remove it once the upgrade fixes that behaviour.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Shipments — Shipment Tracker' };

/** `ShipmentsList` reads the URL through `useSearchParams`, so it needs a `Suspense` boundary (C18). */
export default function ShipmentsPage(): ReactNode {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <ShipmentsList />
    </Suspense>
  );
}
