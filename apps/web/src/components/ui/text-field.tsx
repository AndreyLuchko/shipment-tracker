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
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
          'focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20',
          hasError && 'border-red-600',
          className,
        )}
      />
      {hasError && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
