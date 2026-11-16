import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Pagination } from '@/components/shipments/pagination';

import { routerMock } from '../../helpers/router';

describe('Pagination', () => {
  it('shows the count, the page and two enabled buttons in the middle of the list', () => {
    render(<Pagination query={{ page: 2 }} total={45} totalPages={3} />);

    expect(screen.getByText('45 shipments')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    const previous = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(previous).toBeEnabled();
    expect(next).toBeEnabled();
    expect(previous).toHaveAttribute('type', 'button');
    expect(next).toHaveAttribute('type', 'button');
  });

  it('goes to the next page', async () => {
    render(<Pagination query={{ page: 2 }} total={45} totalPages={3} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }));

    expect(routerMock.push).toHaveBeenCalledWith('/shipments?page=3');
  });

  it('goes to the previous page', async () => {
    render(<Pagination query={{ page: 2 }} total={45} totalPages={3} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Previous' }));

    expect(routerMock.push).toHaveBeenCalledWith('/shipments');
  });

  it('keeps the filters when it changes the page', async () => {
    render(<Pagination query={{ status: 'EXCEPTION', search: 'kyiv', page: 2 }} total={45} totalPages={3} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }));

    expect(routerMock.push).toHaveBeenCalledWith('/shipments?status=EXCEPTION&search=kyiv&page=3');
  });

  it('disables "Previous" on the first page', () => {
    render(<Pagination query={{ page: 1 }} total={45} totalPages={3} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('disables "Next" on the last page', () => {
    render(<Pagination query={{ page: 3 }} total={45} totalPages={3} />);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('shows only the count of a single shipment', () => {
    render(<Pagination query={{ page: 1 }} total={1} totalPages={1} />);

    expect(screen.getByText('1 shipment')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Page/)).not.toBeInTheDocument();
  });

  it('shows no buttons when everything fits on one page', () => {
    render(<Pagination query={{ page: 1 }} total={20} totalPages={1} />);

    expect(screen.getByText('20 shipments')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
