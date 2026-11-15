import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError } from '@/lib/api/client';

/** Where a form keeps the error that belongs to no field: `formState.errors.root?.server`. */
export const FORM_ERROR_KEY = 'root.server';

export const SERVICE_UNAVAILABLE_MESSAGE = 'Service is unavailable. Please try again.';

/** The text to show for a failed request that is not about a single field. Never exposes a raw error. */
export function formErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return SERVICE_UNAVAILABLE_MESSAGE;
  if (error.code === 'RATE_LIMITED') {
    const seconds = error.retryAfterSeconds;
    if (seconds === undefined) return 'Too many attempts. Please try again later.';
    return `Too many attempts. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
  }
  if (error.code === 'INTERNAL_ERROR' || error.status >= 500) return SERVICE_UNAVAILABLE_MESSAGE;
  return error.message;
}

/**
 * Puts a failed request onto a form. `fields` are the form's own field names: a server message is shown
 * under a field only when its path is one of them; everything else becomes the form-level error.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  const fieldFor = (path: string): Path<T> | undefined => fields.find((field) => field === path);

  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    const details = error.details ?? [];
    const seen = new Set<string>();
    let leftover = details.length === 0;
    for (const { path, message } of details) {
      const field = fieldFor(path);
      if (field === undefined) {
        leftover = true;
        continue;
      }
      if (seen.has(field)) continue;
      seen.add(field);
      setError(field, { type: 'server', message });
    }
    if (leftover) setError(FORM_ERROR_KEY, { type: 'server', message: error.message });
    return;
  }

  const emailField = fieldFor('email');
  if (error instanceof ApiError && error.code === 'EMAIL_TAKEN' && emailField !== undefined) {
    setError(emailField, { type: 'server', message: error.message });
    return;
  }

  setError(FORM_ERROR_KEY, { type: 'server', message: formErrorMessage(error) });
}
