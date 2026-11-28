import type { ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { AppHeader } from '@/components/layout/app-header';
import { QueryProvider } from '@/components/providers/query-provider';

/** Every page under `(dashboard)` is protected by this layout and gets a query cache scoped to the session. */
export default function DashboardLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <AuthGuard>
      <QueryProvider>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </QueryProvider>
    </AuthGuard>
  );
}
