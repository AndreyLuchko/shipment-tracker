import type { ShipmentStatus } from '@shipment-tracker/shared';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { STATUS_LABELS } from '@/lib/shipments/status';

// Written out in full so Tailwind finds them; a status without a colour does not compile.
const STATUS_CLASSES: Record<ShipmentStatus, string> = {
  CREATED: cn(
    'bg-slate-100 text-slate-700 ring-slate-200',
    'dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  ),
  PICKED_UP: cn('bg-sky-50 text-sky-700 ring-sky-200', 'dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-800'),
  IN_TRANSIT: cn(
    'bg-indigo-50 text-indigo-700 ring-indigo-200',
    'dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800',
  ),
  AT_WAREHOUSE: cn(
    'bg-amber-50 text-amber-800 ring-amber-200',
    'dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800',
  ),
  OUT_FOR_DELIVERY: cn(
    'bg-violet-50 text-violet-700 ring-violet-200',
    'dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-800',
  ),
  DELIVERED: cn(
    'bg-emerald-50 text-emerald-700 ring-emerald-200',
    'dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800',
  ),
  EXCEPTION: 'bg-red-600 text-white ring-red-600',
};

export function StatusBadge({ status }: { status: ShipmentStatus }): ReactNode {
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        'ring-1 ring-inset',
        STATUS_CLASSES[status],
      )}
    >
      {status === 'EXCEPTION' && <WarningIcon />}
      {STATUS_LABELS[status]}
    </span>
  );
}

function WarningIcon(): ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      />
    </svg>
  );
}
