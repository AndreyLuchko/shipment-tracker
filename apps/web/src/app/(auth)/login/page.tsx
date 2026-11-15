import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Log in — Shipment Tracker' } satisfies Metadata;

export default function LoginPage(): ReactNode {
  return (
    <div className="mt-4 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
      <LoginForm />
      <p className="text-sm text-slate-600">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
