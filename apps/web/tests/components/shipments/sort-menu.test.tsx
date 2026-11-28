import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SortMenu } from '@/components/shipments/sort-menu';
import { parseListParams } from '@/lib/shipments/list-params';

import { routerMock } from '../../helpers/router';

const queryOf = (search: string) => parseListParams(new URLSearchParams(search));

describe('SortMenu', () => {
  it('names the button after the current sort', () => {
    render(<SortMenu query={queryOf('sort=stale')} />);

    const button = screen.getByRole('button', { name: 'Sort: Least recently updated' });
    expect(button).toHaveAttribute('title', 'Sort: Least recently updated');
  });

  it('checks the current sort', async () => {
    render(<SortMenu query={queryOf('sort=updated')} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /^Sort:/ }));

    expect(screen.getByRole('menuitemradio', { name: 'Recently updated' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Newest first' })).not.toBeChecked();
  });

  it('pushes the chosen sort', async () => {
    render(<SortMenu query={queryOf('')} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Sort:/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Oldest first' }));

    expect(routerMock.push).toHaveBeenCalledWith('/shipments?sort=oldest');
  });

  it('opens from the keyboard', async () => {
    render(<SortMenu query={queryOf('')} />);
    const user = userEvent.setup();

    screen.getByRole('button', { name: /^Sort:/ }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<SortMenu query={queryOf('')} />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: /^Sort:/ });

    await user.click(button);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
