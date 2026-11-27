'use client';

import { APP_NAME } from '@shipment-tracker/shared';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formErrorMessage } from '@/lib/form-errors';
import { ROLE_LABELS } from '@/lib/roles';
import { useAuthStore } from '@/stores/auth';

/** The dashboard header. "Log out" only calls the store: `AuthGuard` navigates once the session is gone. */
export function AppHeader(): ReactNode {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user === null) return null;

  const onLogOut = async () => {
    setError(null);
    setPending(true);
    try {
      await logout();
    } catch (failure) {
      setError(formErrorMessage(failure));
    } finally {
      setPending(false);
    }
  };

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/shipments" className="font-semibold text-ink hover:text-accent">
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink">{user.name}</span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
            {ROLE_LABELS[user.role]}
          </span>
          {error !== null && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button variant="secondary" loading={pending} onClick={() => void onLogOut()}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
