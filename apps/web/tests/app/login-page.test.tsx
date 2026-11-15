import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import LoginPage, { metadata } from '@/app/(auth)/login/page';

import { mockFetch } from '../helpers/fetch';

describe('LoginPage', () => {
  it('renders the heading, the form and a link to /register', () => {
    mockFetch();

    render(<LoginPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('No account yet?', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
  });

  it('renders the demo buttons outside the login form', () => {
    mockFetch();

    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Demo dispatcher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demo client' }).closest('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Demo dispatcher' }).closest('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log in' }).closest('form')).not.toBeNull();
  });

  it('never triggers a demo login when the empty form is submitted', async () => {
    const { calls } = mockFetch();
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('sets the page title', () => {
    mockFetch();

    expect(metadata.title).toBe('Log in — Shipment Tracker');
  });
});
