'use client';

import type { ListShipmentsQuery, ShipmentListResponse } from '@shipment-tracker/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Pagination } from '@/components/shipments/pagination';
import { ShipmentsTable } from '@/components/shipments/shipments-table';
import { ShipmentsToolbar } from '@/components/shipments/shipments-toolbar';
import { buttonClassName } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, StaleDataNotice } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WakingUpNotice } from '@/components/ui/waking-up-notice';
import { buildListHref, useListParams, withListChange } from '@/lib/shipments/list-params';
import { useShipmentsQuery } from '@/lib/shipments/queries';
import { useAuthStore } from '@/stores/auth';

const SKELETON_ROWS = 5;

/**
 * The whole list screen: heading, "New shipment", the toolbar, the table with its pagination, and the loading,
 * empty and error states.
 */
export function ShipmentsList(): ReactNode {
  const query = useListParams();
  const list = useShipmentsQuery(query);
  const role = useAuthStore((state) => state.user?.role);
  const isDispatcher = role === 'DISPATCHER';

  let content: ReactNode;
  if (list.data !== undefined) {
    content = (
      <>
        {list.isRefetchError && (
          <div className="mt-6">
            <StaleDataNotice />
          </div>
        )}
        <ListContent data={list.data} query={query} isDispatcher={isDispatcher} busy={list.isPlaceholderData} />
      </>
    );
  } else if (list.isPending) {
    content = (
      <>
        <div role="status" aria-label="Loading shipments" className="mt-6 space-y-3">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
        <div className="mt-3">
          <WakingUpNotice active />
        </div>
      </>
    );
  } else {
    content = (
      <div className="mt-6">
        <ErrorState
          title="Could not load shipments"
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Shipments</h1>
        {isDispatcher && (
          <Link href="/shipments/new" className={buttonClassName('primary')}>
            New shipment
          </Link>
        )}
      </div>
      <ShipmentsToolbar query={query} />
      {content}
    </>
  );
}

function ListContent({
  data,
  query,
  isDispatcher,
  busy,
}: {
  data: ShipmentListResponse;
  query: ListShipmentsQuery;
  isDispatcher: boolean;
  busy: boolean;
}): ReactNode {
  if (data.items.length > 0) {
    return (
      <>
        <ShipmentsTable items={data.items} showClient={isDispatcher} busy={busy} />
        <Pagination query={query} total={data.total} totalPages={data.totalPages} />
      </>
    );
  }

  let empty: ReactNode;
  if (query.page > 1) {
    empty = (
      <EmptyState title="No shipments on this page.">
        <Link href={buildListHref(withListChange(query, { page: 1 }))} className={buttonClassName('secondary')}>
          Back to the first page
        </Link>
      </EmptyState>
    );
  } else if (query.status !== undefined || query.search !== undefined) {
    empty = (
      <EmptyState title="No shipments match your filters.">
        <Link
          href={buildListHref(withListChange(query, { status: undefined, search: undefined }))}
          className={buttonClassName('secondary')}
        >
          Clear filters
        </Link>
      </EmptyState>
    );
  } else {
    empty = (
      <EmptyState
        title="No shipments yet."
        description={isDispatcher ? 'Create the first one.' : 'Shipments assigned to you will appear here.'}
      >
        {isDispatcher ? (
          <Link href="/shipments/new" className={buttonClassName('primary')}>
            New shipment
          </Link>
        ) : undefined}
      </EmptyState>
    );
  }
  return <div className="mt-6">{empty}</div>;
}
