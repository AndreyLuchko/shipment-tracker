import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ShipmentPage, { metadata } from '@/app/(dashboard)/shipments/[id]/page';
import { useAuthStore } from '@/stores/auth';

import { jsonResponse, mockFetch } from '../helpers/fetch';
import { SHIPMENT_DETAIL, USER } from '../helpers/fixtures';
import { renderWithQuery } from '../helpers/query';

describe('ShipmentPage', () => {
  it('renders the detail of the shipment in the URL', async () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });
    const { calls } = mockFetch(jsonResponse(200, { shipment: SHIPMENT_DETAIL }));

    const page = await ShipmentPage({ params: Promise.resolve({ id: 'shp1' }) });
    renderWithQuery(<>{page}</>);

    expect(await screen.findByRole('heading', { level: 1, name: 'ST-2026-000002' })).toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/v1/shipments/shp1');
  });

  it('sets the page title', () => {
    expect(metadata.title).toBe('Shipment — Shipment Tracker');
  });
});
