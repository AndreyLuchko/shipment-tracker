import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/components/auth/login-form';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import { USER } from '../../helpers/fixtures';
import { routerMock } from '../../helpers/router';

const OK = (user: typeof USER): Response => jsonResponse(200, { user });
const INVALID = (): Response => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const LIMITED = (): Response =>
  errorResponse(429, 'RATE_LIMITED', 'Too many requests, please try again later', {
    headers: { 'retry-after': '37' },
  });

function renderForm(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  render(<LoginForm />);
  return user;
}

const emailInput = (): HTMLElement => screen.getByLabelText('Email');
const passwordInput = (): HTMLElement => screen.getByLabelText('Password');
const submitButton = (): HTMLElement => screen.getByRole('button', { name: 'Log in' });

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string): Promise<void> {
  await user.type(emailInput(), email);
  await user.type(passwordInput(), password);
}

async function submit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(submitButton());
}

/** A `role="alert"` that is not the accessible description of an input. */
function formLevelAlerts(): HTMLElement[] {
  const describedBy = new Set(
    Array.from(document.querySelectorAll('[aria-describedby]')).flatMap((el) =>
      (el.getAttribute('aria-describedby') ?? '').split(/\s+/),
    ),
  );
  return screen.queryAllByRole('alert').filter((alert) => !describedBy.has(alert.id));
}

function expectNoNavigation(): void {
  expect(routerMock.replace).not.toHaveBeenCalled();
  expect(routerMock.push).not.toHaveBeenCalled();
}

describe('LoginForm', () => {
  it('renders an email field, a password field and a submit button in a novalidate form', () => {
    renderForm();

    expect(emailInput().tagName).toBe('INPUT');
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'email');
    expect(passwordInput()).toHaveAttribute('type', 'password');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password');
    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(submitButton().closest('form')).toHaveAttribute('novalidate');
  });

  it('shows both field errors on an empty submit, sends nothing and focuses Email', async () => {
    const { calls } = mockFetch();
    const user = renderForm();

    await submit(user);

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput()).toHaveAccessibleDescription('Enter your password');
    expect(calls).toHaveLength(0);
    expect(emailInput()).toHaveFocus();
  });

  it('flags an invalid email only', async () => {
    const { calls } = mockFetch();
    const user = renderForm();

    await fill(user, 'not-an-email', 'x');
    await submit(user);

    await vi.waitFor(() => expect(emailInput()).toHaveAttribute('aria-invalid', 'true'));
    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'false');
    expect(calls).toHaveLength(0);
  });

  it('posts the normalized email and signs the user in', async () => {
    const { calls } = mockFetch(OK(USER));
    const user = renderForm();

    await fill(user, '  Client@Demo.dev ', 'client123');
    await submit(user);

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(useAuthStore.getState().user).toEqual(USER);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/login');
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual({ email: 'client@demo.dev', password: 'client123' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoNavigation();
  });

  it('never trims the password', async () => {
    const { calls } = mockFetch(OK(USER));
    const user = renderForm();

    await fill(user, 'client@demo.dev', ' client123 ');
    await submit(user);

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect((JSON.parse(calls[0]?.body ?? 'null') as { password: string }).password).toBe(' client123 ');
    expectNoNavigation();
  });

  it('shows invalid credentials as a form-level alert and keeps the input', async () => {
    mockFetch(INVALID());
    const user = renderForm();

    await fill(user, 'client@demo.dev', 'wrong-password');
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(formLevelAlerts()).toHaveLength(1);
    expect(emailInput()).toHaveAttribute('aria-invalid', 'false');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'false');
    expect(useAuthStore.getState().status).not.toBe('authenticated');
    expect(emailInput()).toHaveValue('client@demo.dev');
    expect(passwordInput()).toHaveValue('wrong-password');
  });

  it('clears the alert on a retry that succeeds', async () => {
    const { calls } = mockFetch(INVALID(), OK(USER));
    const user = renderForm();

    await fill(user, 'client@demo.dev', 'client123');
    await submit(user);
    await screen.findByRole('alert');
    await submit(user);

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls).toHaveLength(2);
    expectNoNavigation();
  });

  it('shows the rate limit with the retry delay and re-enables the button', async () => {
    mockFetch(LIMITED());
    const user = renderForm();

    await fill(user, 'client@demo.dev', 'client123');
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 37 seconds.');
    expect(formLevelAlerts()).toHaveLength(1);
    expect(submitButton()).toBeEnabled();
  });

  it('puts a server validation error under its field', async () => {
    mockFetch(
      errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', {
        details: [{ path: 'email', message: 'Enter a valid email address' }],
      }),
    );
    const user = renderForm();

    await fill(user, 'client@demo.dev', 'client123');
    await submit(user);

    await vi.waitFor(() => expect(emailInput()).toHaveAttribute('aria-invalid', 'true'));
    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address');
    expect(formLevelAlerts()).toHaveLength(0);
  });

  it.each([
    ['the API is down', (): Response | Error => textResponse(500, 'Internal Server Error')],
    ['the network is offline', (): Response | Error => new TypeError('Failed to fetch')],
    ['a 2xx body breaks the contract', (): Response | Error => jsonResponse(200, { nope: true })],
  ])('shows one readable message when %s', async (_case, reply) => {
    // An unavailable reply is retried once, so it is answered twice.
    mockFetch(reply(), reply());
    const user = renderForm();

    await fill(user, 'client@demo.dev', 'client123');
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Service is unavailable. Please try again.');
    expect(formLevelAlerts()).toHaveLength(1);
    expect(submitButton()).toBeEnabled();
  });

  it('disables the button while the request is pending and ignores a second submit', async () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    const user = renderForm();

    await fill(user, 'client@demo.dev', 'client123');
    await submit(user);

    await vi.waitFor(() => expect(submitButton()).toBeDisabled());
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');
    await submit(user);
    expect(calls).toHaveLength(1);

    reply.resolve(OK(USER));

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(calls).toHaveLength(1);
    expectNoNavigation();
  });
});
