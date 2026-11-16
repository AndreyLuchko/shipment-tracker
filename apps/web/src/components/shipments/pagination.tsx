'use client';

import type { ListShipmentsQuery } from '@shipment-tracker/shared';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { buildListHref, withListChange } from '@/lib/shipments/list-params';

/** The number of shipments and, when there is more than one page, "Previous" / "Next". */
export function Pagination({
  query,
  total,
  totalPages,
}: {
  query: ListShipmentsQuery;
  total: number;
  totalPages: number;
}): ReactNode {
  const router = useRouter();
  const goTo = (page: number) => router.push(buildListHref(withListChange(query, { page })));

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <p>{total === 1 ? '1 shipment' : `${total} shipments`}</p>
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <span>
            Page {query.page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={query.page <= 1} onClick={() => goTo(query.page - 1)}>
            Previous
          </Button>
          <Button variant="secondary" disabled={query.page >= totalPages} onClick={() => goTo(query.page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
