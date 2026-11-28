'use client';

import { ChevronDownIcon, PersonIcon } from '@radix-ui/react-icons';
import { Popover } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { cn } from '@/lib/cn';
import { formErrorMessage } from '@/lib/form-errors';
import { ROLE_LABELS } from '@/lib/roles';
import { useAuthStore } from '@/stores/auth';

/** "Log out" only calls the store: `AuthGuard` navigates once the session is gone. */
export function useLogout(): { logOut: () => Promise<void>; pending: boolean; error: string | null } {
  const logout = useAuthStore((state) => state.logout);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logOut = async () => {
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

  return { logOut, pending, error };
}

/** The phone header's account button: a popover with the name, the role, the theme switcher and "Log out". */
export function AccountMenu(): ReactNode {
  const user = useAuthStore((state) => state.user);
  const { logOut, pending, error } = useLogout();
  const [open, setOpen] = useState(false);

  // The menu is for phones: close it when the viewport grows to `sm`, where the header shows the controls inline.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 640px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  if (user === null) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Account menu"
        className={cn(
          'group inline-flex items-center gap-1 rounded-md border border-line bg-surface p-2 text-ink-muted hover:text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <PersonIcon aria-hidden className="h-4 w-4" />
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
            'group-data-[state=open]:rotate-180',
          )}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Account"
          align="end"
          sideOffset={8}
          className="z-50 flex w-64 flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-ink shadow-lg"
        >
          <div className="flex items-center gap-2">
            <span title={user.name} className="min-w-0 truncate text-sm font-medium text-ink">
              {user.name}
            </span>
            <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
              {ROLE_LABELS[user.role]}
            </span>
          </div>
          <ThemeSwitcher />
          {error !== null && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button variant="secondary" loading={pending} onClick={() => void logOut()}>
            Log out
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
