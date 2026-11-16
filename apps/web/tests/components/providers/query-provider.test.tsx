import type { PublicUser } from '@shipment-tracker/shared';
import { authResponseSchema } from '@shipment-tracker/shared';
import { useQuery } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { AuthGuard } from '@/components/auth/auth-guard';
import { QueryProvider } from '@/components/providers/query-provider';
import { ApiError, apiRequest } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import { DISPATCHER, USER } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';

const OK = (user: PublicUser) => jsonResponse(200, { user });
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const DOWN = () => textResponse(500, 'Internal Server Error');
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const tree = (
  <QueryProvider>
    <Probe />
  </QueryProvider>
);

describe('QueryProvider', () => {
  it('runs a query and does not repeat it', async () => {
    const { calls } = mockFetch(OK(USER));

    render(tree);

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('name:Demo Client')).toBeInTheDocument();
    await pause(50);
    expect(calls.length).toBe(1);
  });

  it('sends one request under StrictMode', async () => {
    const { calls } = mockFetch(OK(USER));

    render(<StrictMode>{tree}</StrictMode>);

    expect(await screen.findByText('name:Demo Client')).toBeInTheDocument();
    await pause(50);
    expect(calls.length).toBe(1);
  });

  it('keeps one client across renders', async () => {
    const { calls } = mockFetch(OK(USER));
    const { rerender } = render(tree);
    await screen.findByText('name:Demo Client');

    rerender(tree);

    expect(screen.getByText('name:Demo Client')).toBeInTheDocument();
    await pause(50);
    expect(calls.length).toBe(1);
  });

  it('does not retry a failed query', async () => {
    const { calls } = mockFetch(DOWN());

    render(tree);

    expect(await screen.findByText('error:INTERNAL_ERROR')).toBeInTheDocument();
    await pause(100);
    expect(calls.length).toBe(1);
  });

  it('ends the session on a 401 inside a query', async () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });
    mockFetch(UNAUTH());

    render(tree);

    expect(await screen.findByText('error:UNAUTHORIZED')).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('renderWithQuery exposes the client it renders with', async () => {
    mockFetch(OK(USER));

    const { queryClient } = renderWithQuery(<Probe />);

    expect(await screen.findByText('name:Demo Client')).toBeInTheDocument();
    expect(queryClient.getQueryData(['probe'])).toEqual({ user: USER });
  });

  it('starts with an empty cache when another user signs in inside the guard', async () => {
    useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });
    const second = deferred<Response>();
    const { calls } = mockFetch(OK(DISPATCHER), second.promise);
    render(<AuthGuard>{tree}</AuthGuard>);
    await screen.findByText('name:Demo Dispatcher');

    act(() => useAuthStore.getState().clear());
    act(() => useAuthStore.setState({ status: 'authenticated', user: USER }));

    expect(screen.queryByText('name:Demo Dispatcher')).not.toBeInTheDocument();
    expect(screen.getByText('loading')).toBeInTheDocument();

    second.resolve(OK(USER));

    expect(await screen.findByText('name:Demo Client')).toBeInTheDocument();
    expect(calls.length).toBe(2);
  });
});
