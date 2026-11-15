import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { RegisterForm } from '@/components/auth/register-form';

export const metadata = { title: 'Create account — Shipment Tracker' } satisfies Metadata;

export default function RegisterPage(): ReactNode {
  return (
    <div className="mt-4 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Create account</h1>
      <RegisterForm />
      <p className="text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
