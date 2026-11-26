'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { ShipmentInfoCard } from '@/components/shipments/shipment-info-card';
import { ShipmentTimeline } from '@/components/shipments/shipment-timeline';
import { StatusBadge } from '@/components/shipments/status-badge';
import { StatusUpdateForm } from '@/components/shipments/status-update-form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, StaleDataNotice } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WakingUpNotice } from '@/components/ui/waking-up-notice';
import { ApiError } from '@/lib/api/client';
import { SHIPMENTS_PATH } from '@/lib/shipments/list-params';
import { useShipmentQuery } from '@/lib/shipments/queries';
import { useAuthStore } from '@/stores/auth';

/** The whole detail screen of one shipment; a dispatcher also gets the manual status update. */
export function ShipmentDetailView({ id }: { id: string }): ReactNode {
  const detail = useShipmentQuery(id);
  const isDispatcher = useAuthStore((state) => state.user?.role === 'DISPATCHER');

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
        <section aria-labelledby="timeline-heading">
          <div className="mt-8 flex items-center justify-between">
            <h2 id="timeline-heading" className="text-lg font-semibold text-slate-900">
              Timeline
            </h2>
            <Button variant="secondary" loading={detail.isFetching} onClick={() => void detail.refetch()}>
              Refresh
            </Button>
          </div>
          <ShipmentTimeline events={shipment.events} />
        </section>
        {isDispatcher && <StatusUpdateForm shipment={shipment} />}
      </>
    );
  } else if (detail.isPending) {
    content = (
      <>
        <div role="status" aria-label="Loading shipment" className="mt-4 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="mt-3">
          <WakingUpNotice active />
        </div>
      </>
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
