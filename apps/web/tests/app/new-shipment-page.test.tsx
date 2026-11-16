import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NewShipmentPage, { metadata } from '@/app/(dashboard)/shipments/new/page';
import { useAuthStore } from '@/stores/auth';

import { jsonResponse, mockFetch } from '../helpers/fetch';
import { CLIENTS, DISPATCHER, USER } from '../helpers/fixtures';
import { renderWithQuery } from '../helpers/query';
import { routerMock } from '../helpers/router';

describe('NewShipmentPage', () => {
  it('renders the heading, the way back and the form for a dispatcher', async () => {
    useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });
    mockFetch(jsonResponse(200, { items: CLIENTS }));

    renderWithQuery(<NewShipmentPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'New shipment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to shipments' })).toHaveAttribute('href', '/shipments');
    expect(await screen.findByRole('combobox', { name: 'Client' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create shipment' })).toBeInTheDocument();
  });

  it('sends a client away without rendering or requesting anything', () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });
    const { calls } = mockFetch();

    renderWithQuery(<NewShipmentPage />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create shipment' })).not.toBeInTheDocument();
    expect(routerMock.replace).toHaveBeenCalledWith('/shipments');
    expect(calls).toHaveLength(0);
  });

  it('sets the page title', () => {
    expect(metadata.title).toBe('New shipment — Shipment Tracker');
  });
});
