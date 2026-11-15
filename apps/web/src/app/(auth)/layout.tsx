import { APP_NAME } from '@shipment-tracker/shared';
import type { ReactNode } from 'react';

import { GuestOnly } from '@/components/auth/guest-only';

export default function AuthLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-indigo-600">{APP_NAME}</p>
        <GuestOnly>{children}</GuestOnly>
      </div>
    </main>
  );
}
