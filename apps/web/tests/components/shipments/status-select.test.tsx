import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { StatusSelect } from '@/components/shipments/status-select';
import { parseListParams } from '@/lib/shipments/list-params';

import { routerMock } from '../../helpers/router';

describe('StatusSelect', () => {
  it('shows the current status and marks it selected', async () => {
    render(<StatusSelect query={parseListParams(new URLSearchParams('status=DELIVERED'))} />);
    const combobox = screen.getByRole('combobox', { name: 'Status' });

    expect(combobox).toHaveTextContent('Delivered');
    await userEvent.setup().click(combobox);

    expect(screen.getByRole('option', { name: 'Delivered' })).toHaveAttribute('aria-selected', 'true');
  });

  it('maps "All statuses" to no status', async () => {
    render(<StatusSelect query={parseListParams(new URLSearchParams('status=DELIVERED&page=2'))} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'All statuses' }));

    expect(routerMock.push).toHaveBeenCalledWith('/shipments');
  });

  it('opens from the keyboard', async () => {
    render(<StatusSelect query={parseListParams(new URLSearchParams(''))} />);
    const user = userEvent.setup();

    screen.getByRole('combobox', { name: 'Status' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<StatusSelect query={parseListParams(new URLSearchParams(''))} />);
    const user = userEvent.setup();
    const combobox = screen.getByRole('combobox', { name: 'Status' });

    await user.click(combobox);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveFocus();
  });
});
