'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@shipment-tracker/shared';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { TextField } from '@/components/ui/text-field';
import { WakingUpNotice } from '@/components/ui/waking-up-notice';
import { applyApiError } from '@/lib/form-errors';
import { useAuthStore } from '@/stores/auth';

/** Signs the user in. It does not navigate: `GuestOnly` moves a signed-in user on. */
export function LoginForm(): ReactNode {
  const login = useAuthStore((state) => state.login);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
    } catch (error) {
      applyApiError(error, setError, ['email', 'password']);
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <FormAlert message={errors.root?.server?.message} />
      <Button type="submit" loading={isSubmitting} className="w-full">
        Log in
      </Button>
      <WakingUpNotice active={isSubmitting} />
    </form>
  );
}
