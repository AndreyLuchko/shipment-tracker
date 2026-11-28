import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type TextFieldProps = ComponentProps<'input'> & {
  label: string;
  error?: string;
  /** Shown inside the box, before the text (e.g. an icon). */
  leading?: ReactNode;
  /** Shown inside the box, after the text (e.g. a clear button). */
  trailing?: ReactNode;
};

/** A label, an input and the input's error. `ref` reaches the `<input>` (React Hook Form's `register()`). */
export function TextField({ label, error, leading, trailing, id, className, ...rest }: TextFieldProps): ReactNode {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div className="relative mt-1">
        {leading != null && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            {leading}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          className={cn(
            'block w-full rounded-lg border border-line-strong bg-surface py-2 text-sm text-ink',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
            leading != null ? 'pl-9' : 'pl-3',
            trailing != null ? 'pr-9' : 'pr-3',
            hasError && 'border-red-600',
            className,
          )}
        />
        {trailing != null && <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>}
      </div>
      {hasError && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
