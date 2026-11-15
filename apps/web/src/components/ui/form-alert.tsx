import type { ReactNode } from 'react';

/** The form-level error; renders nothing without a message. */
export function FormAlert({ message }: { message?: string }): ReactNode {
  if (!message) return null;

  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}
