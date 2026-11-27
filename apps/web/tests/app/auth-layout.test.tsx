import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AuthLayout from '@/app/(auth)/layout';
import { useAuthStore } from '@/stores/auth';

import { mockFetch } from '../helpers/fetch';
import { USER } from '../helpers/fixtures';
import { routerMock } from '../helpers/router';

describe('AuthLayout', () => {
  it("renders the app name and the page's content inside <main>", () => {
    mockFetch();

    render(
      <AuthLayout>
        <h1>Log in</h1>
      </AuthLayout>,
    );

    const main = screen.getByRole('main');
    const appName = screen.getByText('Shipment Tracker');
    expect(main).toContainElement(appName);
    expect(main).toContainElement(screen.getByRole('heading', { name: 'Log in' }));
    expect(screen.queryByRole('heading', { name: 'Shipment Tracker' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('puts the theme switcher on the page, outside the card', () => {
    mockFetch();

    render(
      <AuthLayout>
        <h1>Log in</h1>
      </AuthLayout>,
    );

    const group = screen.getByRole('group', { name: 'Theme' });
    const card = screen.getByText('Shipment Tracker').parentElement as HTMLElement;
    expect(screen.getByRole('main')).toContainElement(group);
    expect(card).not.toContainElement(group);
    expect(within(group).getAllByRole('button')).toHaveLength(3);
  });

  it('sends a signed-in user to /shipments', async () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });
    mockFetch();

    render(
      <AuthLayout>
        <h1>Log in</h1>
      </AuthLayout>,
    );

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments'));
  });
});
