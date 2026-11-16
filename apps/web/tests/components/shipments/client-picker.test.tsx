import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClientPicker } from '@/components/shipments/client-picker';

import { deferred, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import { CLIENTS } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';

const CLIENT_LIST = () => jsonResponse(200, { items: CLIENTS });
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');
const SERVICE = 'Service is unavailable. Please try again.';
const EMPTY = 'No clients yet. A client has to register before a shipment can be created for them.';

const renderPicker = (props: ComponentProps<typeof ClientPicker> = {}) => renderWithQuery(<ClientPicker {...props} />);
/** The pending state renders a "Client" select too; the loaded one has the blank option. */
const loadedSelect = async () => {
  await screen.findByRole('option', { name: 'Select a client' });
  return screen.getByRole('combobox', { name: 'Client' });
};
const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('ClientPicker', () => {
  it('shows a disabled placeholder select while the clients load', () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);

    renderPicker({ name: 'clientId' });

    const select = screen.getByRole('combobox', { name: 'Client' });
    expect(select).toBeDisabled();
    expect(optionTexts(select)).toEqual(['Loading clients…']);
    expect(select).not.toHaveAttribute('name');
    expect(calls[0]?.url).toBe('/api/v1/users?role=CLIENT');
  });

  it('lists the clients in the order received after a blank option', async () => {
    mockFetch(CLIENT_LIST());

    renderPicker();

    const select = await loadedSelect();
    expect(select).toBeEnabled();
    const options = within(select).getAllByRole<HTMLOptionElement>('option');
    expect(options.map((option) => [option.textContent, option.value])).toEqual([
      ['Select a client', ''],
      ['Acme Logistics — acme@example.com', 'u3'],
      ['Demo Client — client@demo.dev', 'u1'],
    ]);
    expect(select).toHaveValue('');
  });

  it('explains that there are no clients yet', async () => {
    mockFetch(jsonResponse(200, { items: [] }));

    renderPicker();

    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it.each([
    ['a server error', DOWN],
    ['a network error', OFFLINE],
  ])('shows an error state on %s', async (_label, reply) => {
    mockFetch(reply());

    renderPicker();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load clients');
    expect(alert).toHaveTextContent(SERVICE);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('loads the clients on retry', async () => {
    mockFetch(DOWN(), CLIENT_LIST());
    const user = userEvent.setup();
    renderPicker();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    const select = await loadedSelect();
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the field error', async () => {
    mockFetch(CLIENT_LIST());

    renderPicker({ error: 'Select a client' });

    const select = await loadedSelect();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Select a client');
  });

  it('passes the name, the ref and the change handler to the select', async () => {
    mockFetch(CLIENT_LIST());
    const ref = createRef<HTMLSelectElement>();
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPicker({ name: 'clientId', ref, onChange });

    const select = await loadedSelect();
    await user.selectOptions(select, screen.getByRole('option', { name: 'Demo Client — client@demo.dev' }));

    expect(select).toHaveAttribute('name', 'clientId');
    expect(ref.current).toBe(select);
    expect(onChange).toHaveBeenCalled();
    expect(select).toHaveValue('u1');
  });
});
