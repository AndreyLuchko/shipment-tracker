import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ShipmentsToolbar } from '@/components/shipments/shipments-toolbar';
import { useListParams } from '@/lib/shipments/list-params';

import { navigate, routerMock } from '../../helpers/router';

function Harness(): ReactNode {
  return <ShipmentsToolbar query={useListParams()} />;
}

const search = () => screen.getByLabelText<HTMLInputElement>('Search');
const status = () => screen.getByLabelText<HTMLSelectElement>('Status');
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/** Neither `replace` nor `push` was called, after the debounce had every chance to fire. */
async function expectNoNavigation(): Promise<void> {
  await wait(400);
  expect(routerMock.replace).not.toHaveBeenCalled();
  expect(routerMock.push).not.toHaveBeenCalled();
}

describe('ShipmentsToolbar', () => {
  it('renders an empty search box and every status on /shipments', () => {
    navigate('/shipments');
    render(<Harness />);

    expect(search()).toHaveValue('');
    expect(search()).toHaveAttribute('type', 'search');
    expect(search()).toHaveAttribute('maxlength', '100');
    expect(status()).toHaveValue('');
    expect(
      within(status())
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'All statuses',
      'Created',
      'Picked up',
      'In transit',
      'At warehouse',
      'Out for delivery',
      'Delivered',
      'Exception',
    ]);
  });

  it('shows the view of the URL without navigating', async () => {
    navigate('/shipments?status=EXCEPTION&search=lviv');
    render(<Harness />);

    expect(within(status()).getByRole<HTMLOptionElement>('option', { name: 'Exception' }).selected).toBe(true);
    expect(search()).toHaveValue('lviv');
    await expectNoNavigation();
  });

  it('pushes the chosen status', async () => {
    navigate('/shipments');
    render(<Harness />);

    await userEvent.setup().selectOptions(status(), 'EXCEPTION');

    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith('/shipments?status=EXCEPTION');
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('keeps the search and drops the page when the status changes', async () => {
    navigate('/shipments?status=EXCEPTION&search=kyiv&page=3');
    render(<Harness />);

    await userEvent.setup().selectOptions(status(), 'DELIVERED');

    expect(routerMock.push).toHaveBeenCalledWith('/shipments?status=DELIVERED&search=kyiv');
  });

  it('clears the status on "All statuses"', async () => {
    navigate('/shipments?status=EXCEPTION&page=2');
    render(<Harness />);

    await userEvent.setup().selectOptions(status(), '');

    expect(routerMock.push).toHaveBeenCalledWith('/shipments');
  });

  it('replaces the URL once the typed text has settled, and never undoes typing', async () => {
    navigate('/shipments');
    render(<Harness />);
    const user = userEvent.setup();

    await user.type(search(), 'kyiv');
    expect(routerMock.replace).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments?search=kyiv'));
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(search()).toHaveValue('kyiv');

    await user.type(search(), ' hub');
    expect(search()).toHaveValue('kyiv hub');
    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenLastCalledWith('/shipments?search=kyiv+hub'));
    expect(search()).toHaveValue('kyiv hub');
    await wait(50);
    expect(search()).toHaveValue('kyiv hub');
    expect(routerMock.replace).toHaveBeenCalledTimes(2);
  });

  it('keeps the status and drops the page when the search changes', async () => {
    navigate('/shipments?status=DELIVERED&page=3');
    render(<Harness />);

    await userEvent.setup().type(search(), 'lviv');

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments?status=DELIVERED&search=lviv'));
  });

  it('removes the search when the box is cleared', async () => {
    navigate('/shipments?status=DELIVERED&search=kyiv');
    render(<Harness />);

    await userEvent.setup().clear(search());

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments?status=DELIVERED'));
  });

  it('does not navigate for whitespace', async () => {
    navigate('/shipments');
    render(<Harness />);

    await userEvent.setup().type(search(), '   ');

    await expectNoNavigation();
  });

  it('follows an outside change of the URL', async () => {
    navigate('/shipments?search=lviv');
    render(<Harness />);

    act(() => navigate('/shipments'));

    expect(search()).toHaveValue('');
    await expectNoNavigation();
  });

  it('lets an outside change win over text that has not settled', async () => {
    navigate('/shipments?search=lviv');
    render(<Harness />);

    await userEvent.setup().type(search(), 'x');
    act(() => navigate('/shipments'));

    expect(search()).toHaveValue('');
    await expectNoNavigation();
    expect(search()).toHaveValue('');
  });

  it('keeps the text when only the status changes outside', async () => {
    navigate('/shipments?search=lviv');
    render(<Harness />);

    act(() => navigate('/shipments?search=lviv&status=EXCEPTION'));

    expect(search()).toHaveValue('lviv');
    expect(within(status()).getByRole<HTMLOptionElement>('option', { name: 'Exception' }).selected).toBe(true);
    await expectNoNavigation();
  });

  it('navigates exactly once under StrictMode', async () => {
    navigate('/shipments?search=lviv');
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    await expectNoNavigation();
    await userEvent.setup().type(search(), 'x');

    await vi.waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/shipments?search=lvivx'));
    await wait(50);
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
  });
});
