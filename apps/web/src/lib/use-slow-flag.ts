'use client';

import { useEffect, useState } from 'react';

/** How long a request may wait before the visitor is told the demo server is waking up. */
export const SLOW_REQUEST_NOTICE_MS = 3_000;

/** `true` once `active` has stayed `true` for `delayMs`; `false` as soon as `active` is `false`. */
export function useSlowFlag(active: boolean, delayMs: number = SLOW_REQUEST_NOTICE_MS): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, delayMs]);

  return active && slow;
}
