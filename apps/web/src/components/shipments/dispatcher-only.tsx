'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { SHIPMENTS_PATH } from '@/lib/shipments/list-params';
import { useAuthStore } from '@/stores/auth';

/** Renders `children` for a dispatcher; sends any other signed-in user to `/shipments` (D6). */
export function DispatcherOnly({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const isDispatcher = role === 'DISPATCHER';
  // No user: the session just ended, and `AuthGuard` owns that navigation.
  const isOtherUser = role !== undefined && !isDispatcher;

  useEffect(() => {
    if (isOtherUser) router.replace(SHIPMENTS_PATH);
  }, [isOtherUser, router]);

  // The children never render for a client, so nothing inside them can request `GET /users`.
  return isDispatcher ? children : null;
}
