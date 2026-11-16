import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShipmentTimeline } from '@/components/shipments/shipment-timeline';

import { EVENTS, NEW_EVENT, NOW } from '../../helpers/fixtures';

// Entries start at `opacity: 0` and fade in, so they are never asserted with `toBeVisible`.
const entries = () => screen.getAllByRole('listitem');

function entry(index: number): HTMLElement {
  const item = entries()[index];
  if (item === undefined) throw new Error(`No timeline entry at index ${index}`);
  return item;
}

describe('ShipmentTimeline', () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
  });

  it('lists the events oldest first', () => {
    render(<ShipmentTimeline events={EVENTS} />);

    expect(screen.getByRole('list', { name: 'Movement timeline' })).toBeInTheDocument();
    expect(entries()).toHaveLength(3);
    for (const item of entries()) expect(item.tagName).toBe('LI');
    const statuses = entries().map((item) => item.querySelector('[data-status]')?.textContent);
    expect(statuses).toEqual(['Created', 'Picked up', 'In transit']);
  });

  it('shows the source and the time of an entry without a location', () => {
    render(<ShipmentTimeline events={EVENTS} />);

    expect(entry(0)).toHaveTextContent('System');
    expect(entry(0)).toHaveTextContent('1 day ago');
    expect(entry(0)).not.toHaveTextContent('Odesa depot');
    expect(entry(0)).not.toHaveTextContent('Dnipro sorting hub');
  });

  it('shows the location and the exact time of an entry', () => {
    render(<ShipmentTimeline events={EVENTS} />);

    expect(entry(1)).toHaveTextContent('Picked up');
    expect(entry(1)).toHaveTextContent('Carrier webhook');
    expect(entry(1)).toHaveTextContent('Odesa depot');
    const time = entry(1).querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-11-14T11:00:00.000Z');
    expect(time).toHaveAttribute('title', '14 Nov 2026, 11:00');
    expect(time).toHaveTextContent('1 day ago');
  });

  it('marks the last entry as the current one', () => {
    render(<ShipmentTimeline events={EVENTS} />);

    expect(entry(2)).toHaveTextContent('Manual update');
    expect(entry(2)).toHaveTextContent('Dnipro sorting hub');
    expect(entry(2)).toHaveTextContent('Left the hub on time');
    expect(entry(2)).toHaveTextContent('2 hours ago');
    expect(entry(2)).toHaveAttribute('aria-current', 'step');
    expect(entry(0)).not.toHaveAttribute('aria-current');
    expect(entry(1)).not.toHaveAttribute('aria-current');
  });

  it('says so when there are no events', () => {
    render(<ShipmentTimeline events={[]} />);

    expect(screen.getByText('No movements recorded yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('appends a new event without replacing the existing entries', () => {
    const { rerender } = render(<ShipmentTimeline events={EVENTS} />);
    const before = entries();

    rerender(<ShipmentTimeline events={[...EVENTS, NEW_EVENT]} />);

    const after = entries();
    expect(after).toHaveLength(4);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(entry(3)).toHaveTextContent('At warehouse');
    expect(entry(3)).toHaveTextContent('Kharkiv hub');
    expect(entry(3)).toHaveTextContent('5 minutes ago');
    expect(entry(3)).toHaveAttribute('aria-current', 'step');
    expect(entry(2)).not.toHaveAttribute('aria-current');
  });
});
