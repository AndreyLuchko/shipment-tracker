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
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted',
};

/** The look of `Button`, for a link that should look like one (C26). */
export function buttonClassName(variant: ButtonVariant = 'primary', className?: string): string {
  return cn(
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
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
  children,
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
    >
      {loading ? (
        <span className="relative inline-flex items-center justify-center">
          <Spinner />
          <span className="opacity-0">{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/** Centred over the label, which stays in the layout (opacity-0, not visibility:hidden, which would drop the accessible name) so the button keeps its width. */
function Spinner(): ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="absolute size-4 animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
