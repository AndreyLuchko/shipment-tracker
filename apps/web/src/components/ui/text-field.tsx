import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type TextFieldProps = ComponentProps<'input'> & { label: string; error?: string };

/** A label, an input and the input's error. `ref` reaches the `<input>` (React Hook Form's `register()`). */
export function TextField({ label, error, id, className, ...rest }: TextFieldProps): ReactNode {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          'mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink',
          'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
          hasError && 'border-red-600',
          className,
        )}
      />
      {hasError && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
