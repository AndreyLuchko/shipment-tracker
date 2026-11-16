import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShipmentsTable } from '@/components/shipments/shipments-table';

import { EXCEPTION_SHIPMENT, NOW, SHIPMENT } from '../../helpers/fixtures';

const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent);
const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('ShipmentsTable', () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
  });

  it('shows every column for a dispatcher, one row per shipment', () => {
    render(<ShipmentsTable items={[SHIPMENT, EXCEPTION_SHIPMENT]} showClient />);

    expect(screen.getByRole('table', { name: 'Shipments' })).toBeInTheDocument();
    expect(headers()).toEqual(['Tracking number', 'Client', 'Route', 'Description', 'Status', 'Updated']);
    expect(bodyRows()).toHaveLength(2);
  });

  it('fills the first row', () => {
    render(<ShipmentsTable items={[SHIPMENT, EXCEPTION_SHIPMENT]} showClient />);

    const row = within(bodyRows()[0]!);
    expect(row.getByRole('link', { name: 'ST-2026-000002' })).toHaveAttribute('href', '/shipments/shp1');
    expect(row.getByText('Demo Client')).toBeInTheDocument();
    expect(row.getByText('Odesa, UA → Kharkiv, UA')).toBeInTheDocument();
    expect(row.getByText('Box of spare machine parts')).toHaveAttribute('title', 'Box of spare machine parts');
    expect(row.getByText('In transit')).toBeInTheDocument();
    const time = row.getByText('2 hours ago');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-11-15T10:00:00.000Z');
    expect(time).toHaveAttribute('title', '15 Nov 2026, 10:00');
  });

  it('fills the second row', () => {
    render(<ShipmentsTable items={[SHIPMENT, EXCEPTION_SHIPMENT]} showClient />);

    const row = within(bodyRows()[1]!);
    expect(row.getByRole('link', { name: 'ST-2026-000003' })).toHaveAttribute('href', '/shipments/shp2');
    expect(row.getByText('Acme Logistics')).toBeInTheDocument();
    expect(row.getByText('Kyiv, UA → Lviv, UA')).toBeInTheDocument();
    expect(row.getByText('Exception')).toBeInTheDocument();
    expect(row.getByText('30 minutes ago')).toBeInTheDocument();
  });

  it('leaves out the Client column for a client', () => {
    render(<ShipmentsTable items={[SHIPMENT]} showClient={false} />);

    expect(headers()).toEqual(['Tracking number', 'Route', 'Description', 'Status', 'Updated']);
    expect(screen.queryByText('Demo Client')).not.toBeInTheDocument();
  });

  it('is marked busy only while busy', () => {
    const { rerender } = render(<ShipmentsTable items={[SHIPMENT]} showClient busy />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');

    rerender(<ShipmentsTable items={[SHIPMENT]} showClient />);
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy');
  });
});
