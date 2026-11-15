import type { ReactNode } from 'react';

export const metadata = { title: 'Shipments — Shipment Tracker' };

/** A placeholder until M6 builds the shipments list. */
export default function ShipmentsPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Shipments</h1>
      <p className="mt-2 text-sm text-slate-600">The dashboard is coming soon.</p>
    </>
  );
}
