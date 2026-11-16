import Link from 'next/link';
import type { ReactNode } from 'react';

import { DispatcherOnly } from '@/components/shipments/dispatcher-only';
import { NewShipmentForm } from '@/components/shipments/new-shipment-form';
import { SHIPMENTS_PATH } from '@/lib/shipments/list-params';

export const metadata = { title: 'New shipment — Shipment Tracker' };

export default function NewShipmentPage(): ReactNode {
  return (
    <DispatcherOnly>
      <Link href={SHIPMENTS_PATH} className="text-sm font-medium text-indigo-600 hover:underline">
        Back to shipments
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">New shipment</h1>
      <NewShipmentForm />
    </DispatcherOnly>
  );
}
