import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type SelectFieldProps = ComponentProps<'select'> & { label: string; error?: string };

/** A label, a select and the select's error — `TextField` for `<select>`. The options are its children. */
export function SelectField({ label, error, id, className, children, ...rest }: SelectFieldProps): ReactNode {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const hasError = Boolean(error);

  return (
    <div>
      <label htmlFor={selectId} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          'mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink',
          'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
          hasError && 'border-red-600',
          className,
        )}
      >
        {children}
      </select>
      {hasError && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
