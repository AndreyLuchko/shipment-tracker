import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ShipmentsPage, { dynamic, metadata } from '@/app/(dashboard)/shipments/page';
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

  // A prerendered /shipments makes Next.js 16.2 reuse the URL of a direct load (e.g. /shipments?search=kyiv) for
  // every later soft navigation to /shipments, so the list could never leave that query (task 19f).
  it('is rendered per request, so a direct load with a query does not pin the URL', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('sets the page title', () => {
    expect(metadata.title).toBe('Shipments — Shipment Tracker');
  });
});
