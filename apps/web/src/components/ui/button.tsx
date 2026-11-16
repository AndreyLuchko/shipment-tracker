import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type ButtonProps = ComponentProps<'button'> & {
  /** Defaults to 'primary'. */
  variant?: 'primary' | 'secondary';
  /** Disables the button and marks it busy while a request is in flight. */
  loading?: boolean;
};

type ButtonVariant = NonNullable<ButtonProps['variant']>;

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
  secondary: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
};

/** The look of `Button`, for a link that should look like one (C26). */
export function buttonClassName(variant: ButtonVariant = 'primary', className?: string): string {
  return cn(
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANT_CLASSES[variant],
    className,
  );
}

export function Button({
  variant = 'primary',
  loading = false,
  type = 'button',
  disabled,
  className,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      data-variant={variant}
      className={buttonClassName(variant, className)}
    />
  );
}
