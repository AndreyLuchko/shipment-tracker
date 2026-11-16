import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ShipmentsPage, { metadata } from '@/app/(dashboard)/shipments/page';
import { useAuthStore } from '@/stores/auth';

import { jsonResponse, mockFetch } from '../helpers/fetch';
import { listPage, SHIPMENT, USER } from '../helpers/fixtures';
import { renderWithQuery } from '../helpers/query';

describe('ShipmentsPage', () => {
  it('renders the shipments list', async () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });
    mockFetch(jsonResponse(200, listPage([SHIPMENT])));

    renderWithQuery(<ShipmentsPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Shipments' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'ST-2026-000002' })).toBeInTheDocument();
  });

  it('sets the page title', () => {
    expect(metadata.title).toBe('Shipments — Shipment Tracker');
  });
});
