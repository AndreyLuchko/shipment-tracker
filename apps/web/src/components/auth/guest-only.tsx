'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { safeNextPath } from '@/lib/next-path';
import { useAuthStore } from '@/stores/auth';

/** Auth pages: always renders `children`; sends a signed-in user to the validated `?next=` (or `/shipments`). */
export function GuestOnly({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // On `anonymous` there is nothing to do: a dead session must leave the form usable, not loop.
    // `window.location` is read here, not during render, so the auth pages need no `Suspense` boundary.
    if (status === 'authenticated') {
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')));
    }
  }, [status, router]);

  return children;
}
