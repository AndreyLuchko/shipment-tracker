import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorState, StaleDataNotice } from '@/components/ui/error-state';
import { ApiError, NetworkError } from '@/lib/api/client';

const SERVICE = 'Service is unavailable. Please try again.';
const FORBIDDEN_ERROR = new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });

describe('ErrorState', () => {
  it('shows the title, the reason and a "Try again" button that retries', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Could not load shipments" error={FORBIDDEN_ERROR} onRetry={onRetry} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load shipments');
    expect(alert).toHaveTextContent('Insufficient permissions');
    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button).toHaveAttribute('type', 'button');

    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each([
    ['a network failure', new NetworkError(new TypeError('Failed to fetch'))],
    ['a server error', new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' })],
    ['an unknown error', new Error('db password is hunter2')],
  ])('shows the service message for %s and never raw text', (_name, error) => {
    render(<ErrorState title="Could not load shipments" error={error} onRetry={() => {}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(SERVICE);
    expect(alert).not.toHaveTextContent('hunter2');
  });

  it('disables "Try again" while the retry is in flight', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Could not load shipments" error={FORBIDDEN_ERROR} onRetry={onRetry} retrying />);

    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('StaleDataNotice', () => {
  it('says the last loaded data is shown', () => {
    render(<StaleDataNotice />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh. Showing the last loaded data.');
  });
});
