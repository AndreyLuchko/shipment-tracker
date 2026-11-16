import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { formErrorMessage } from '@/lib/form-errors';

/** A request failed and there is nothing to show: the title, a readable reason and a "Try again" button. */
export function ErrorState({
  title,
  error,
  onRetry,
  retrying = false,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  /** `true` while the retry is in flight. */
  retrying?: boolean;
}): ReactNode {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-6 text-center">
      <p className="text-sm font-semibold text-red-800">{title}</p>
      <p className="mt-1 text-sm text-red-700">{formErrorMessage(error)}</p>
      <div className="mt-4">
        <Button variant="secondary" loading={retrying} onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/** A refetch failed but the last good data is still on screen (C16). */
export function StaleDataNotice(): ReactNode {
  return (
    <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Could not refresh. Showing the last loaded data.
    </p>
  );
}
