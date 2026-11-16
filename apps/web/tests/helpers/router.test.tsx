import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useSearchParams } from 'next/navigation';
import { describe, expect, it } from 'vitest';

import { navigate, routerMock } from './router';

function Probe() {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <div>
      <p>
        page:{searchParams.get('page') ?? 1} status:{searchParams.get('status') ?? '-'}
      </p>
      <button type="button" onClick={() => router.push('/shipments?page=2&status=EXCEPTION')}>
        go
      </button>
    </div>
  );
}

function currentLocation(): string {
  return window.location.pathname + window.location.search;
}

describe('the stateful next/navigation mock', () => {
  it('starts every test at /', () => {
    expect(currentLocation()).toBe('/');
  });

  it('push moves the location and re-renders useSearchParams', async () => {
    navigate('/shipments');
    render(<Probe />);

    await userEvent.click(screen.getByRole('button', { name: 'go' }));

    expect(screen.getByText('page:2 status:EXCEPTION')).toBeInTheDocument();
    expect(routerMock.push).toHaveBeenCalledWith('/shipments?page=2&status=EXCEPTION');
    expect(window.location.search).toBe('?page=2&status=EXCEPTION');
  });

  it('keeps navigating after mockReset between tests', async () => {
    expect(currentLocation()).toBe('/');
    expect(routerMock.push).not.toHaveBeenCalled();
    render(<Probe />);

    await userEvent.click(screen.getByRole('button', { name: 'go' }));

    expect(screen.getByText('page:2 status:EXCEPTION')).toBeInTheDocument();
  });

  it('navigate re-renders a mounted component', () => {
    navigate('/shipments?page=3');
    render(<Probe />);
    expect(screen.getByText('page:3 status:-')).toBeInTheDocument();

    act(() => navigate('/shipments'));

    expect(screen.getByText('page:1 status:-')).toBeInTheDocument();
  });

  it('replace moves the location too', () => {
    routerMock.replace('/login');

    expect(window.location.pathname).toBe('/login');
    expect(routerMock.replace).toHaveBeenCalledWith('/login');
  });
});
