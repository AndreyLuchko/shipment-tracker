import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { activeFilterCount, FiltersPopover } from '@/components/shipments/filters-popover';
import { parseListParams } from '@/lib/shipments/list-params';

import { routerMock } from '../../helpers/router';

const queryOf = (search: string) => parseListParams(new URLSearchParams(search));

describe('activeFilterCount', () => {
  it.each([
    ['', 0],
    ['status=EXCEPTION', 1],
    ['sort=oldest', 1],
    ['status=EXCEPTION&sort=oldest', 2],
    ['status=nope&sort=price', 0],
  ])('counts %j as %i', (search, count) => {
    expect(activeFilterCount(queryOf(search))).toBe(count);
  });
});

describe('FiltersPopover', () => {
  it('has a plain name and no badge without filters', () => {
    render(<FiltersPopover query={queryOf('')} />);

    expect(screen.getByRole('button', { name: 'Filters and sort' })).toBeInTheDocument();
    expect(screen.queryByTestId('filters-badge')).not.toBeInTheDocument();
  });

  it('names the button with the active count', () => {
    render(<FiltersPopover query={queryOf('status=EXCEPTION&sort=oldest')} />);

    expect(screen.getByRole('button', { name: 'Filters and sort, 2 active' })).toBeInTheDocument();
    expect(screen.getByTestId('filters-badge')).toHaveTextContent('2');
  });

  it('opens with Status, Sort and Clear filters', async () => {
    render(<FiltersPopover query={queryOf('')} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Filters and sort' }));

    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Newest first');
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('pushes the chosen sort from the popover', async () => {
    render(<FiltersPopover query={queryOf('status=EXCEPTION')} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Filters and sort/ }));
    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(screen.getByRole('option', { name: 'Oldest first' }));

    expect(routerMock.push).toHaveBeenCalledWith('/shipments?status=EXCEPTION&sort=oldest');
  });

  it('Clear filters drops status and sort but keeps search', async () => {
    render(<FiltersPopover query={queryOf('search=kyiv&status=EXCEPTION&sort=oldest&page=2')} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Filters and sort/ }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(routerMock.push).toHaveBeenCalledWith('/shipments?search=kyiv');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens from the keyboard', async () => {
    render(<FiltersPopover query={queryOf('')} />);
    const user = userEvent.setup();

    screen.getByRole('button', { name: 'Filters and sort' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<FiltersPopover query={queryOf('')} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Filters and sort' });

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
