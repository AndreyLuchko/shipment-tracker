import { render, screen } from '@testing-library/react';
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

  it('sets the page title', () => {
    mockFetch();

    expect(metadata.title).toBe('Log in — Shipment Tracker');
  });
});
