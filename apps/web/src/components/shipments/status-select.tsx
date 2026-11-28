'use client';

import { type ListShipmentsQuery, SHIPMENT_STATUSES, shipmentStatusSchema } from '@shipment-tracker/shared';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Select } from '@/components/ui/select';
import { buildListHref, withListChange } from '@/lib/shipments/list-params';
import { STATUS_LABELS } from '@/lib/shipments/status';

/** The Radix item value of "All statuses": Radix forbids an empty value. */
export const ALL_STATUSES = 'ALL';

const ITEMS = [
  { value: ALL_STATUSES, label: 'All statuses' },
  ...SHIPMENT_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
];

/** The status filter; writes the choice to the URL. */
export function StatusSelect({ query }: { query: ListShipmentsQuery }): ReactNode {
  const router = useRouter();

  const onValueChange = (value: string) => {
    const parsed = shipmentStatusSchema.safeParse(value);
    router.push(buildListHref(withListChange(query, { status: parsed.success ? parsed.data : undefined })));
  };

  return <Select label="Status" value={query.status ?? ALL_STATUSES} onValueChange={onValueChange} items={ITEMS} />;
}
