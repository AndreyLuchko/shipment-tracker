import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** A pulsing grey block; its shape comes from `className`. The surrounding `role="status"` announces it. */
export function Skeleton({ className }: { className?: string }): ReactNode {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-surface-muted', className)} />;
}
