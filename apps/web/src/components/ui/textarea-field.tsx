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
      <label htmlFor={textareaId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        {...rest}
        id={textareaId}
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
