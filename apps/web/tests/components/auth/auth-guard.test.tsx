import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuthGuard } from '@/components/auth/auth-guard';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { USER } from '../../helpers/fixtures';
import { routerMock } from '../../helpers/router';

const OK = (user: unknown) => jsonResponse(200, { user });
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');

const withCsrfCookie = () => setCookie('csrf_token', 'tok_-1');
const signIn = () => useAuthStore.setState({ status: 'authenticated', user: USER });
const renderGuard = () =>
  render(
    <AuthGuard>
      <p>secret</p>
    </AuthGuard>,
  );

describe('AuthGuard', () => {
  it('sends an anonymous visitor to /login without asking the API', async () => {
    const { calls } = mockFetch();

    renderGuard();

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows a loading status while the session probe is pending, then the children', async () => {
    withCsrfCookie();
    const reply = deferred<Response>();
    mockFetch(reply.promise);

    renderGuard();

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();

    reply.resolve(OK(USER));

    expect(await screen.findByText('secret')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('sends a dead session (401 from /auth/me) to /login', async () => {
    withCsrfCookie();
    mockFetch(UNAUTH());

    renderGuard();

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it.each([
    ['the API is down', DOWN],
    ['the network is offline', OFFLINE],
  ])('sends the visitor to /login when %s', async (_label, reply) => {
    withCsrfCookie();
    mockFetch(reply());

    renderGuard();

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders the children at once for a signed-in user', () => {
    signIn();
    const { calls } = mockFetch();

    renderGuard();

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('hides the children and sends the user to /login once the session is cleared', async () => {
    signIn();
    mockFetch();
    renderGuard();
    expect(screen.getByText('secret')).toBeInTheDocument();

    act(() => useAuthStore.getState().clear());

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/login'));
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
  });

  it('asks for the session once under StrictMode', async () => {
    withCsrfCookie();
    const { calls } = mockFetch(OK(USER));

    render(
      <StrictMode>
        <AuthGuard>
          <p>secret</p>
        </AuthGuard>
      </StrictMode>,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});
