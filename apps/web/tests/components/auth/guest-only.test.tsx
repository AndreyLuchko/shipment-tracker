import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GuestOnly } from '@/components/auth/guest-only';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, setCookie } from '../../helpers/fetch';
import { USER } from '../../helpers/fixtures';
import { routerMock } from '../../helpers/router';

const OK = (user: unknown) => jsonResponse(200, { user });
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');

const withCsrfCookie = () => setCookie('csrf_token', 'tok_-1');
const signIn = () => useAuthStore.setState({ status: 'authenticated', user: USER });
const renderGuest = () =>
  render(
    <GuestOnly>
      <p>form</p>
    </GuestOnly>,
  );

describe('GuestOnly', () => {
  it('renders the children at once for an anonymous visitor and stays put', async () => {
    const { calls } = mockFetch();

    renderGuest();

    expect(screen.getByText('form')).toBeInTheDocument();
    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'));
    expect(calls).toHaveLength(0);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('keeps the children visible while the probe is pending, then sends a live session to /shipments', async () => {
    withCsrfCookie();
    const reply = deferred<Response>();
    mockFetch(reply.promise);

    renderGuest();

    expect(screen.getByText('form')).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();

    reply.resolve(OK(USER));

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments'));
  });

  it('keeps the form and does not redirect on a dead session (401 from /auth/me)', async () => {
    withCsrfCookie();
    mockFetch(UNAUTH());

    renderGuest();

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'));
    expect(screen.getByText('form')).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('sends the user to /shipments once after a successful login', async () => {
    mockFetch();
    renderGuest();

    act(() => useAuthStore.setState({ status: 'authenticated', user: USER }));

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments'));
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
  });

  it('sends a signed-in user to /shipments without asking the API', async () => {
    signIn();
    const { calls } = mockFetch();

    renderGuest();

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments'));
    expect(calls).toHaveLength(0);
  });
});
