import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DemoLogin } from '@/components/auth/demo-login';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Log in — Shipment Tracker' } satisfies Metadata;

export default function LoginPage(): ReactNode {
  return (
    <div className="mt-4 space-y-6">
      <h1 className="text-xl font-semibold text-ink">Log in</h1>
      <LoginForm />
      <DemoLogin />
      <p className="text-sm text-ink-muted">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
