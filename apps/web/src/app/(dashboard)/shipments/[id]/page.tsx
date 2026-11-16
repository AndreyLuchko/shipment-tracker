import type { ReactNode } from 'react';

import { ShipmentDetailView } from '@/components/shipments/shipment-detail';

export const metadata = { title: 'Shipment — Shipment Tracker' };

// The props type is written out: `PageProps<'/shipments/[id]'>` exists only after `next build`.
export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await params;
  return <ShipmentDetailView id={id} />;
}
