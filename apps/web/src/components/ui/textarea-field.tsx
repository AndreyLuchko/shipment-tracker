import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type TextareaFieldProps = ComponentProps<'textarea'> & { label: string; error?: string };

/** A label, a textarea and the textarea's error — `TextField` for `<textarea>`. */
export function TextareaField({ label, error, id, className, ...rest }: TextareaFieldProps): ReactNode {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;
  const hasError = Boolean(error);

  return (
    <div>
      <label htmlFor={textareaId} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <textarea
        {...rest}
        id={textareaId}
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
