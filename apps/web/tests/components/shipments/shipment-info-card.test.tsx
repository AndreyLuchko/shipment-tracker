import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShipmentInfoCard } from '@/components/shipments/shipment-info-card';

import { EXCEPTION_SHIPMENT, SHIPMENT } from '../../helpers/fixtures';

/** The `<dd>` that follows the `<dt>` with this text. */
function definition(term: string): HTMLElement {
  const dt = screen.getByText(term, { selector: 'dt' });
  const dd = dt.nextElementSibling;
  if (!(dd instanceof HTMLElement) || dd.tagName !== 'DD') throw new Error(`No <dd> after the term "${term}"`);
  return dd;
}

describe('ShipmentInfoCard', () => {
  it('lists the terms in order', () => {
    const { container } = render(<ShipmentInfoCard shipment={SHIPMENT} />);

    const terms = Array.from(container.querySelectorAll('dt'), (dt) => dt.textContent);
    expect(terms).toEqual(['Client', 'Route', 'Description', 'Weight', 'Carrier', 'Created']);
  });

  it('shows the shipment', () => {
    render(<ShipmentInfoCard shipment={SHIPMENT} />);

    expect(definition('Client')).toHaveTextContent('Demo Client');
    expect(definition('Client')).toHaveTextContent('client@demo.dev');
    expect(definition('Route')).toHaveTextContent('Odesa, UA → Kharkiv, UA');
    expect(definition('Description')).toHaveTextContent('Box of spare machine parts');
    expect(definition('Weight')).toHaveTextContent('8.2 kg');
    expect(definition('Carrier')).toHaveTextContent('SIMULATED');

    const time = definition('Created').querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-11-14T08:00:00.000Z');
    expect(time).toHaveTextContent('14 Nov 2026, 08:00');
  });

  it('shows a dash for a missing weight', () => {
    render(<ShipmentInfoCard shipment={EXCEPTION_SHIPMENT} />);

    expect(definition('Weight')).toHaveTextContent(/^—$/);
  });
});
