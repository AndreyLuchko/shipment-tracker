import { authResponseSchema, type PublicUser } from '@shipment-tracker/shared';
import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DashboardLayout from '@/app/(dashboard)/layout';
import { ApiError, apiRequest } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth';

import { emptyResponse, jsonResponse, mockFetch, setCookie } from '../helpers/fetch';
import { USER } from '../helpers/fixtures';
import { routerMock } from '../helpers/router';

const OK = (user: PublicUser) => jsonResponse(200, { user });

function Probe(): ReactNode {
  const query = useQuery({
    queryKey: ['probe'],
    queryFn: () => apiRequest('/auth/me', { schema: authResponseSchema }),
  });
  if (query.isPending) return <p>loading</p>;
  if (query.error instanceof ApiError) return <p>error:{query.error.code}</p>;
  if (query.isError) return <p>error:unknown</p>;
  return <p>name:{query.data.user.name}</p>;
}

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

  it('lets a page run a query without a provider of its own', async () => {
    signIn();
    mockFetch(OK(USER));

    render(
      <DashboardLayout>
        <Probe />
      </DashboardLayout>,
    );

    expect(await screen.findByText('name:Demo Client')).toBeInTheDocument();
  });
});
