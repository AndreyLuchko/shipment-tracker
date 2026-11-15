import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RegisterPage, { metadata } from '@/app/(auth)/register/page';

import { mockFetch } from '../helpers/fetch';

describe('RegisterPage', () => {
  it('renders the heading, the form and a link to /login', () => {
    mockFetch();

    render(<RegisterPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Already have an account?', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('sets the page title', () => {
    mockFetch();

    expect(metadata.title).toBe('Create account — Shipment Tracker');
  });
});
