import type { ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { AppHeader } from '@/components/layout/app-header';

/** Every page under `(dashboard)` is protected by this layout. */
export default function DashboardLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <AuthGuard>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </AuthGuard>
  );
}
