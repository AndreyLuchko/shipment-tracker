'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { useAuthStore } from '@/stores/auth';

/** Auth pages: always renders `children`; sends a signed-in user to `/shipments`. */
export function GuestOnly({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // On `anonymous` there is nothing to do: a dead session must leave the form usable, not loop.
    if (status === 'authenticated') router.replace('/shipments');
  }, [status, router]);

  return children;
}
