import type { ShipmentSummary } from '@shipment-tracker/shared';
import type { ReactNode } from 'react';

import { formatDateTime, formatWeight } from '@/lib/format';

/** The facts of one shipment as a definition list: client, route, description, weight, carrier, creation time. */
export function ShipmentInfoCard({ shipment }: { shipment: ShipmentSummary }): ReactNode {
  return (
    <section aria-label="Shipment details" className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Item term="Client">
          {shipment.client.name}
          <span className="block text-slate-600">{shipment.client.email}</span>
        </Item>
        <Item term="Route">{`${shipment.origin} → ${shipment.destination}`}</Item>
        <Item term="Description">{shipment.description}</Item>
        <Item term="Weight">{formatWeight(shipment.weightKg)}</Item>
        <Item term="Carrier">{shipment.carrier}</Item>
        <Item term="Created">
          <time dateTime={shipment.createdAt}>{formatDateTime(shipment.createdAt)}</time>
        </Item>
      </dl>
    </section>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }): ReactNode {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}
