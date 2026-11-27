import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { RegisterForm } from '@/components/auth/register-form';

export const metadata = { title: 'Create account — Shipment Tracker' } satisfies Metadata;

export default function RegisterPage(): ReactNode {
  return (
    <div className="mt-4 space-y-6">
      <h1 className="text-xl font-semibold text-ink">Create account</h1>
      <RegisterForm />
      <p className="text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
