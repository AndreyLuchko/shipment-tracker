'use client';

import { type ReactNode, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { DEMO_ACCOUNTS, type DemoAccount } from '@/lib/demo-accounts';
import { formErrorMessage } from '@/lib/form-errors';
import { useAuthStore } from '@/stores/auth';

/**
 * Signs in with a seeded account in one click. It does not navigate: `GuestOnly` moves a signed-in user on.
 * Rendered outside `LoginForm`'s `<form>`, so its buttons never submit it.
 */
export function DemoLogin(): ReactNode {
  const login = useAuthStore((state) => state.login);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  // State updates are async; the ref stops a second click that lands before the re-render.
  const inFlight = useRef(false);

  async function signIn({ label, email, password }: DemoAccount): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(label);
    setError(undefined);
    try {
      await login({ email, password });
    } catch (failure) {
      setError(formErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-slate-500">or try the demo</p>
      <div className="grid grid-cols-2 gap-3">
        {DEMO_ACCOUNTS.map((account) => (
          <Button
            key={account.email}
            variant="secondary"
            loading={pending === account.label}
            disabled={pending !== null}
            onClick={() => void signIn(account)}
          >
            {account.label}
          </Button>
        ))}
      </div>
      <FormAlert message={error} />
    </div>
  );
}
