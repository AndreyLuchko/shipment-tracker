'use client';

import type { ReactNode } from 'react';

import { useSlowFlag } from '@/lib/use-slow-flag';

/** Tells the visitor why a first request is slow (a sleeping free-tier host); renders nothing until it is. */
export function WakingUpNotice({ active }: { active: boolean }): ReactNode {
  const slow = useSlowFlag(active);
  if (!slow) return null;
  return (
    <p role="status" className="text-sm text-red-600 dark:text-red-400">
      Waking up the demo server. The first request after a quiet spell can take up to a minute.
    </p>
  );
}
