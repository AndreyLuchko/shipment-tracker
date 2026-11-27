import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RegisterForm } from '@/components/auth/register-form';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import { USER } from '../../helpers/fixtures';
import { routerMock } from '../../helpers/router';

const TAKEN = (): Response => errorResponse(409, 'EMAIL_TAKEN', 'Email is already registered');
const LIMITED = (): Response =>
  errorResponse(429, 'RATE_LIMITED', 'Too many requests, please try again later', {
    headers: { 'retry-after': '37' },
  });

type Fields = { name: string; email: string; password: string };
const VALID: Fields = { name: ' Olena ', email: ' New.Client@Example.com ', password: 'password123' };

type User = ReturnType<typeof userEvent.setup>;

function renderForm(): User {
  const user = userEvent.setup();
  render(<RegisterForm />);
  return user;
}

const nameInput = (): HTMLElement => screen.getByLabelText('Name');
const emailInput = (): HTMLElement => screen.getByLabelText('Email');
const passwordInput = (): HTMLElement => screen.getByLabelText('Password');
const submitButton = (): HTMLElement => screen.getByRole('button', { name: 'Create account' });

async function fill(user: User, { name, email, password }: Fields): Promise<void> {
  await user.type(nameInput(), name);
  await user.type(emailInput(), email);
  await user.type(passwordInput(), password);
}

async function submit(user: User): Promise<void> {
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

describe('RegisterForm', () => {
  it('renders the three fields and the submit button, with no role choice', () => {
    renderForm();

    expect(nameInput()).toHaveAttribute('autocomplete', 'name');
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'email');
    expect(passwordInput()).toHaveAttribute('type', 'password');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.queryByRole('group', { name: 'Account type' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText('Demo project: pick the role you want to try.')).not.toBeInTheDocument();
    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(submitButton().closest('form')).toHaveAttribute('novalidate');
  });

  it('shows the field errors on an empty submit, sends nothing and focuses Name', async () => {
    const { calls } = mockFetch();
    const user = renderForm();

    await submit(user);

    await vi.waitFor(() => expect(nameInput()).toHaveAttribute('aria-invalid', 'true'));
    expect(nameInput()).toHaveAccessibleDescription('Enter your name');
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput()).toHaveAccessibleDescription('Password must be at least 8 characters');
    expect(calls).toHaveLength(0);
    expect(nameInput()).toHaveFocus();
  });

  it('rejects a short password', async () => {
    const { calls } = mockFetch();
    const user = renderForm();

    await fill(user, { ...VALID, password: 'short' });
    await submit(user);

    await vi.waitFor(() => expect(passwordInput()).toHaveAttribute('aria-invalid', 'true'));
    expect(passwordInput()).toHaveAccessibleDescription('Password must be at least 8 characters');
    expect(calls).toHaveLength(0);
  });

  it('posts only name, email and password and signs the user in', async () => {
    const { calls } = mockFetch(jsonResponse(201, { user: USER }));
    const user = renderForm();

    await fill(user, VALID);
    await submit(user);

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(useAuthStore.getState().user).toEqual(USER);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/register');
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual({
      name: 'Olena',
      email: 'new.client@example.com',
      password: 'password123',
    });
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('puts EMAIL_TAKEN under the Email field and keeps the input', async () => {
    mockFetch(TAKEN());
    const user = renderForm();

    await fill(user, VALID);
    await submit(user);

    await vi.waitFor(() => expect(emailInput()).toHaveAttribute('aria-invalid', 'true'));
    expect(emailInput()).toHaveAccessibleDescription('Email is already registered');
    expect(formLevelAlerts()).toHaveLength(0);
    expect(useAuthStore.getState().status).not.toBe('authenticated');
    expect(nameInput()).toHaveValue(VALID.name);
    // An `<input type="email">` strips surrounding whitespace from its value (HTML value sanitization).
    expect(emailInput()).toHaveValue(VALID.email.trim());
    expect(passwordInput()).toHaveValue(VALID.password);
  });

  it('puts server validation errors under Name', async () => {
    mockFetch(
      errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', {
        details: [{ path: 'name', message: 'Enter your name' }],
      }),
    );
    const user = renderForm();

    await fill(user, VALID);
    await submit(user);

    await vi.waitFor(() => expect(nameInput()).toHaveAttribute('aria-invalid', 'true'));
    expect(nameInput()).toHaveAccessibleDescription('Enter your name');
    expect(formLevelAlerts()).toHaveLength(0);
  });

  it('shows the rate limit with the retry delay', async () => {
    mockFetch(LIMITED());
    const user = renderForm();

    await fill(user, VALID);
    await submit(user);

    await vi.waitFor(() => expect(formLevelAlerts()).toHaveLength(1));
    expect(formLevelAlerts()[0]).toHaveTextContent('Too many attempts. Try again in 37 seconds.');
  });

  it.each([
    ['the API is down', (): Response | Error => textResponse(500, 'Internal Server Error')],
    ['the network is offline', (): Response | Error => new TypeError('Failed to fetch')],
  ])('shows one readable message when %s', async (_case, reply) => {
    mockFetch(reply());
    const user = renderForm();

    await fill(user, VALID);
    await submit(user);

    await vi.waitFor(() => expect(formLevelAlerts()).toHaveLength(1));
    expect(formLevelAlerts()[0]).toHaveTextContent('Service is unavailable. Please try again.');
    expect(submitButton()).toBeEnabled();
  });

  it('disables the button while the request is pending and ignores a second submit', async () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    const user = renderForm();

    await fill(user, VALID);
    await submit(user);

    await vi.waitFor(() => expect(submitButton()).toBeDisabled());
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');
    await submit(user);
    expect(calls).toHaveLength(1);

    reply.resolve(jsonResponse(201, { user: USER }));

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(calls).toHaveLength(1);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
