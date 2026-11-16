import type { ShipmentSummary } from '@shipment-tracker/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { StatusBadge } from '@/components/shipments/status-badge';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelativeTime } from '@/lib/format';

const HEADER_CLASS = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500';

export function ShipmentsTable({
  items,
  showClient,
  busy = false,
}: {
  items: ShipmentSummary[];
  /** The Client column (dispatcher only). */
  showClient: boolean;
  /** `true` while these rows are the previous page's and the next one is loading. */
  busy?: boolean;
}): ReactNode {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table aria-busy={busy ? true : undefined} className={cn('min-w-full text-left text-sm', busy && 'opacity-60')}>
        <caption className="sr-only">Shipments</caption>
        <thead>
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Tracking number
            </th>
            {showClient && (
              <th scope="col" className={HEADER_CLASS}>
                Client
              </th>
            )}
            <th scope="col" className={HEADER_CLASS}>
              Route
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Description
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Status
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((shipment) => (
            <tr key={shipment.id} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-4 py-3">
                <Link href={`/shipments/${shipment.id}`} className="font-medium text-indigo-600 hover:underline">
                  {shipment.trackingNumber}
                </Link>
              </td>
              {showClient && <td className="whitespace-nowrap px-4 py-3 text-slate-900">{shipment.client.name}</td>}
              <td className="whitespace-nowrap px-4 py-3 text-slate-900">
                {`${shipment.origin} → ${shipment.destination}`}
              </td>
              <td title={shipment.description} className="max-w-xs truncate px-4 py-3 text-slate-600">
                {shipment.description}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={shipment.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                <time dateTime={shipment.updatedAt} title={formatDateTime(shipment.updatedAt)}>
                  {formatRelativeTime(shipment.updatedAt)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
