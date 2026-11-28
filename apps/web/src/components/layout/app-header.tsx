'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { AccountMenu, useLogout } from '@/components/layout/account-menu';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/ui/logo-mark';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { ROLE_LABELS } from '@/lib/roles';
import { useAuthStore } from '@/stores/auth';

/** The dashboard header: the logo, and the account controls (inline from `sm`, in a popover on phones). */
export function AppHeader(): ReactNode {
  const user = useAuthStore((state) => state.user);
  const { logOut, pending, error } = useLogout();

  if (user === null) return null;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/shipments" aria-label="Shipment Tracker" className="shrink-0 text-ink hover:text-accent">
          <LogoMark className="h-10 w-auto" />
        </Link>
        <div className="hidden items-center gap-3 sm:flex">
          <ThemeSwitcher />
          <span title={user.name} className="max-w-[12rem] truncate text-sm font-medium text-ink">
            {user.name}
          </span>
          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
            {ROLE_LABELS[user.role]}
          </span>
          {error !== null && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button variant="secondary" loading={pending} onClick={() => void logOut()}>
            Log out
          </Button>
        </div>
        <div className="sm:hidden">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
