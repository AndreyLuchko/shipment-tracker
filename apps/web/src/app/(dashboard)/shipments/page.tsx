import { type ReactNode, Suspense } from 'react';

import { ShipmentsList } from '@/components/shipments/shipments-list';

export const metadata = { title: 'Shipments — Shipment Tracker' };

/** `ShipmentsList` reads the URL through `useSearchParams`, so it needs a `Suspense` boundary (C18). */
export default function ShipmentsPage(): ReactNode {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <ShipmentsList />
    </Suspense>
  );
}
