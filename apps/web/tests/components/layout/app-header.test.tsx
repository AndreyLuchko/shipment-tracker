import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from '@/components/layout/app-header';
import { ROLE_LABELS } from '@/lib/roles';
import { useAuthStore } from '@/stores/auth';

import { deferred, emptyResponse, errorResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { DISPATCHER, USER } from '../../helpers/fixtures';
import { routerMock } from '../../helpers/router';

const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const BAD_CSRF = () => errorResponse(403, 'CSRF_TOKEN_INVALID', 'CSRF token missing or invalid');
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');

const signIn = (user = USER) => useAuthStore.setState({ status: 'authenticated', user });
const withCsrfCookie = () => setCookie('csrf_token', 'tok_-1');
const status = () => useAuthStore.getState().status;
const logOutButton = () => screen.getByRole('button', { name: 'Log out' });

async function logOut(user = userEvent.setup()): Promise<void> {
  await user.click(logOutButton());
}

describe('AppHeader', () => {
  afterEach(() => {
    // The header never navigates: `AuthGuard` owns that (C12).
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("shows the app name as a link to the list, the user's name, the role and a Log out button", () => {
    signIn();
    mockFetch();

    render(<AppHeader />);

    expect(screen.getByRole('link', { name: 'Shipment Tracker' })).toHaveAttribute('href', '/shipments');
    expect(screen.getByText('Demo Client')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(logOutButton()).toHaveAttribute('type', 'button');
  });

  it('has the theme switcher before the name', () => {
    signIn();
    mockFetch();

    render(<AppHeader />);

    const group = screen.getByRole('group', { name: 'Theme' });
    const name = screen.getByText('Demo Client');
    expect(group.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the dispatcher role', () => {
    signIn(DISPATCHER);
    mockFetch();

    render(<AppHeader />);

    expect(screen.getByText('Demo Dispatcher')).toBeInTheDocument();
    expect(screen.getByText('Dispatcher')).toBeInTheDocument();
  });

  it('renders nothing while there is no user', () => {
    mockFetch();

    const { container } = render(<AppHeader />);

    expect(container).toBeEmptyDOMElement();
  });

  it('logs out through the API and clears the session', async () => {
    signIn();
    withCsrfCookie();
    const { calls } = mockFetch(emptyResponse());
    render(<AppHeader />);

    await logOut();

    await vi.waitFor(() => expect(status()).toBe('anonymous'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/logout');
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
    expect(calls[0]?.headers.get('content-type')).toBeNull();
  });

  it.each([
    ['CSRF_TOKEN_INVALID', BAD_CSRF],
    ['UNAUTHORIZED', UNAUTH],
  ])('treats %s as already signed out', async (_name, reply) => {
    signIn();
    mockFetch(reply());
    render(<AppHeader />);

    await logOut();

    await vi.waitFor(() => expect(status()).toBe('anonymous'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['the API is down', DOWN],
    ['the network is offline', OFFLINE],
  ])('keeps the session and shows an alert when %s', async (_name, reply) => {
    signIn();
    mockFetch(reply());
    render(<AppHeader />);

    await logOut();

    expect(await screen.findByRole('alert')).toHaveTextContent('Service is unavailable. Please try again.');
    expect(status()).toBe('authenticated');
    expect(logOutButton()).toBeEnabled();
  });

  it('clears the alert and retries on a later click', async () => {
    signIn();
    const { calls } = mockFetch(DOWN(), emptyResponse());
    render(<AppHeader />);
    const user = userEvent.setup();

    await logOut(user);
    await screen.findByRole('alert');
    await logOut(user);

    await vi.waitFor(() => expect(status()).toBe('anonymous'));
    expect(calls).toHaveLength(2);
  });

  it('disables the button while the logout is pending', async () => {
    signIn();
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    render(<AppHeader />);
    const user = userEvent.setup();

    await logOut(user);

    expect(logOutButton()).toBeDisabled();
    expect(logOutButton()).toHaveAttribute('aria-busy', 'true');
    await logOut(user);
    expect(calls).toHaveLength(1);

    reply.resolve(emptyResponse());
    await vi.waitFor(() => expect(status()).toBe('anonymous'));
  });
});

describe('ROLE_LABELS', () => {
  it('names every role', () => {
    expect(ROLE_LABELS).toEqual({ DISPATCHER: 'Dispatcher', CLIENT: 'Client' });
  });
});
