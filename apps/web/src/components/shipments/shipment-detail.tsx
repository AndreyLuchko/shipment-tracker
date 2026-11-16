'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { ShipmentInfoCard } from '@/components/shipments/shipment-info-card';
import { StatusBadge } from '@/components/shipments/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, StaleDataNotice } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { SHIPMENTS_PATH } from '@/lib/shipments/list-params';
import { useShipmentQuery } from '@/lib/shipments/queries';

/** The whole detail screen of one shipment. Tasks 8 and 11 add the timeline and the status form to it. */
export function ShipmentDetailView({ id }: { id: string }): ReactNode {
  const detail = useShipmentQuery(id);

  let content: ReactNode;
  if (detail.data !== undefined) {
    const shipment = detail.data;
    content = (
      <>
        {detail.isRefetchError && (
          <div className="mt-4">
            <StaleDataNotice />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{shipment.trackingNumber}</h1>
          <StatusBadge status={shipment.status} />
        </div>
        <ShipmentInfoCard shipment={shipment} />
      </>
    );
  } else if (detail.isPending) {
    content = (
      <div role="status" aria-label="Loading shipment" className="mt-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  } else if (isNotFound(detail.error)) {
    content = (
      <div className="mt-4">
        <EmptyState title="Shipment not found" description="It does not exist or you do not have access to it." />
      </div>
    );
  } else {
    content = (
      <div className="mt-4">
        <ErrorState
          title="Could not load the shipment"
          error={detail.error}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      </div>
    );
  }

  return (
    <>
      <Link href={SHIPMENTS_PATH} className="text-sm font-medium text-indigo-600 hover:underline">
        Back to shipments
      </Link>
      {content}
    </>
  );
}

/** Someone else's shipment and a missing one look the same; an id the API's router refuses names none (C17). */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'BAD_REQUEST');
}
