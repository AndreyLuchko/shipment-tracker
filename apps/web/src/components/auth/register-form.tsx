'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type Role } from '@shipment-tracker/shared';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { TextField } from '@/components/ui/text-field';
import { applyApiError } from '@/lib/form-errors';
import { ROLE_LABELS } from '@/lib/roles';
import { useAuthStore } from '@/stores/auth';

const ROLE_OPTIONS: readonly Role[] = ['CLIENT', 'DISPATCHER'];

/** Creates an account and signs the user in. It does not navigate: `GuestOnly` moves a signed-in user on. */
export function RegisterForm(): ReactNode {
  const signUp = useAuthStore((state) => state.register);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', role: 'CLIENT' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signUp(values);
    } catch (error) {
      applyApiError(error, setError, ['name', 'email', 'password', 'role']);
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <TextField label="Name" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <fieldset>
        <legend className="block text-sm font-medium text-slate-700">Account type</legend>
        <div className="mt-2 flex gap-6">
          {ROLE_OPTIONS.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm text-slate-900">
              <input type="radio" value={role} className="accent-indigo-600" {...register('role')} />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-600">Demo project: pick the role you want to try.</p>
        {errors.role?.message && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {errors.role.message}
          </p>
        )}
      </fieldset>
      <FormAlert message={errors.root?.server?.message} />
      <Button type="submit" loading={isSubmitting} className="w-full">
        Create account
      </Button>
    </form>
  );
}
