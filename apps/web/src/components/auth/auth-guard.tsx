'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { loginHref } from '@/lib/next-path';
import { useAuthStore } from '@/stores/auth';

/** Protected pages: renders `children` only for a signed-in user; sends an anonymous one to `/login?next=…`. */
export function AuthGuard({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === 'anonymous') router.replace(loginHref(window.location.pathname + window.location.search));
  }, [status, router]);

  if (status !== 'authenticated') return <p role="status">Loading…</p>;
  return children;
}
