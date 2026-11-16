import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NewShipmentPage, { metadata } from '@/app/(dashboard)/shipments/new/page';
import { useAuthStore } from '@/stores/auth';

import { mockFetch } from '../helpers/fetch';
import { DISPATCHER, USER } from '../helpers/fixtures';
import { renderWithQuery } from '../helpers/query';
import { routerMock } from '../helpers/router';

describe('NewShipmentPage', () => {
  it('renders the heading and the way back for a dispatcher', () => {
    useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });
    mockFetch();

    renderWithQuery(<NewShipmentPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'New shipment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to shipments' })).toHaveAttribute('href', '/shipments');
  });

  it('sends a client away without rendering or requesting anything', () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });
    const { calls } = mockFetch();

    renderWithQuery(<NewShipmentPage />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(routerMock.replace).toHaveBeenCalledWith('/shipments');
    expect(calls).toHaveLength(0);
  });

  it('sets the page title', () => {
    expect(metadata.title).toBe('New shipment — Shipment Tracker');
  });
});
