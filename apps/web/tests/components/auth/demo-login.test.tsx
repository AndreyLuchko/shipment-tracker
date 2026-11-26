import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DemoLogin } from '@/components/auth/demo-login';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import { DISPATCHER, USER } from '../../helpers/fixtures';
import { routerMock } from '../../helpers/router';

const OK = (user: typeof USER): Response => jsonResponse(200, { user });
const INVALID = (): Response => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const LIMITED = (): Response =>
  errorResponse(429, 'RATE_LIMITED', 'Too many requests, please try again later', {
    headers: { 'retry-after': '37' },
  });

type Name = 'Demo dispatcher' | 'Demo client';

const button = (name: Name): HTMLElement => screen.getByRole('button', { name });

function renderDemo(): (name: Name) => Promise<void> {
  const user = userEvent.setup();
  render(<DemoLogin />);
  return (name) => user.click(button(name));
}

afterEach(() => {
  // Every row: navigation after a session change belongs to the guards (C12).
  expect(routerMock.replace).not.toHaveBeenCalled();
  expect(routerMock.push).not.toHaveBeenCalled();
});

describe('DemoLogin', () => {
  it('renders the caption and two enabled plain buttons, without an alert', () => {
    mockFetch();
    renderDemo();

    expect(screen.getByText('or try the demo')).toBeInTheDocument();
    for (const name of ['Demo dispatcher', 'Demo client'] as const) {
      expect(button(name)).toHaveAttribute('type', 'button');
      expect(button(name)).toBeEnabled();
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('signs in as the demo client', async () => {
    const { calls } = mockFetch(OK(USER));
    const click = renderDemo();

    await click('Demo client');

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/login');
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual({ email: 'client@demo.dev', password: 'client123' });
    expect(useAuthStore.getState().user).toEqual(USER);
  });

  it('signs in as the demo dispatcher', async () => {
    const { calls } = mockFetch(OK(DISPATCHER));
    const click = renderDemo();

    await click('Demo dispatcher');

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual({ email: 'dispatcher@demo.dev', password: 'dispatcher123' });
    expect(useAuthStore.getState().user).toEqual(DISPATCHER);
  });

  it('disables both buttons while an attempt is pending and sends nothing on a second click', async () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    const click = renderDemo();

    await click('Demo client');

    expect(button('Demo client')).toBeDisabled();
    expect(button('Demo dispatcher')).toBeDisabled();
    expect(button('Demo client')).toHaveAttribute('aria-busy', 'true');
    expect(button('Demo dispatcher')).not.toHaveAttribute('aria-busy');

    await click('Demo dispatcher');
    expect(calls).toHaveLength(1);

    reply.resolve(OK(USER));
    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
  });

  it('shows "Invalid email or password" against an unseeded database and re-enables the buttons', async () => {
    mockFetch(INVALID());
    const click = renderDemo();

    await click('Demo client');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(button('Demo client')).toBeEnabled();
    expect(button('Demo dispatcher')).toBeEnabled();
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('shows the rate-limit message with the seconds from Retry-After', async () => {
    mockFetch(LIMITED());
    const click = renderDemo();

    await click('Demo client');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 37 seconds.');
  });

  it.each([
    ['the API is down', (): Response | Error => textResponse(500, 'Internal Server Error')],
    ['the network is offline', (): Response | Error => new TypeError('Failed to fetch')],
  ])('shows the generic message when %s', async (_, reply) => {
    // An unavailable reply is retried once, so it is answered twice.
    mockFetch(reply(), reply());
    const click = renderDemo();

    await click('Demo client');

    expect(await screen.findByRole('alert')).toHaveTextContent('Service is unavailable. Please try again.');
  });

  it('clears the alert on the next click', async () => {
    mockFetch(INVALID(), OK(USER));
    const click = renderDemo();

    await click('Demo client');
    await screen.findByRole('alert');
    await click('Demo client');

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
