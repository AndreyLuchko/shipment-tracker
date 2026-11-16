import { SHIPMENT_STATUSES } from '@shipment-tracker/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '@/components/shipments/status-badge';
import { STATUS_LABELS } from '@/lib/shipments/status';

describe('StatusBadge', () => {
  it.each(SHIPMENT_STATUSES)('shows the label of %s and carries the status', (status) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByText(STATUS_LABELS[status]);
    expect(badge).toHaveAttribute('data-status', status);
  });

  it('marks EXCEPTION with a decorative warning icon', () => {
    const { container } = render(<StatusBadge status="EXCEPTION" />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(SHIPMENT_STATUSES.filter((status) => status !== 'EXCEPTION'))('shows no icon for %s', (status) => {
    const { container } = render(<StatusBadge status={status} />);

    expect(container.querySelector('svg')).toBeNull();
  });
});
