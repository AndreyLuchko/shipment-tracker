'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@shipment-tracker/shared';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { TextField } from '@/components/ui/text-field';
import { applyApiError } from '@/lib/form-errors';
import { useAuthStore } from '@/stores/auth';

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
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signUp(values);
    } catch (error) {
      applyApiError(error, setError, ['name', 'email', 'password']);
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
      <FormAlert message={errors.root?.server?.message} />
      <Button type="submit" loading={isSubmitting} className="w-full">
        Create account
      </Button>
    </form>
  );
}
