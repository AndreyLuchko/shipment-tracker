import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ShipmentsPage, { metadata } from '@/app/(dashboard)/shipments/page';

describe('ShipmentsPage', () => {
  it('renders the placeholder', () => {
    render(<ShipmentsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Shipments' })).toBeInTheDocument();
    expect(screen.getByText('The dashboard is coming soon.')).toBeInTheDocument();
  });

  it('sets the page title', () => {
    expect(metadata.title).toBe('Shipments — Shipment Tracker');
  });
});
