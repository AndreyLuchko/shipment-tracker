import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DashboardLayout from '@/app/(dashboard)/layout';
import { useAuthStore } from '@/stores/auth';

import { emptyResponse, mockFetch, setCookie } from '../helpers/fetch';
import { USER } from '../helpers/fixtures';
import { routerMock } from '../helpers/router';

const signIn = () => useAuthStore.setState({ status: 'authenticated', user: USER });
const renderLayout = () =>
  render(
    <DashboardLayout>
      <p>content</p>
    </DashboardLayout>,
  );

describe('DashboardLayout', () => {
  it('renders the header and the page inside <main> for a signed-in user', () => {
    signIn();
    mockFetch();

    renderLayout();

    expect(screen.getByText('Demo Client')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('content'));
  });

  it('sends an anonymous visitor to /login without rendering the page', async () => {
    mockFetch();

    renderLayout();

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('leaves for /login after Log out', async () => {
    signIn();
    setCookie('csrf_token', 'tok_-1');
    mockFetch(emptyResponse());
    renderLayout();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }));

    await vi.waitFor(() => expect(screen.queryByText('content')).not.toBeInTheDocument());
    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/login'));
  });
});
