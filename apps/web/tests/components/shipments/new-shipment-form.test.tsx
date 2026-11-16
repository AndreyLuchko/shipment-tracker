import type { ErrorDetail, ShipmentDetail } from '@shipment-tracker/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewShipmentForm } from '@/components/shipments/new-shipment-form';
import { shipmentKeys } from '@/lib/shipments/queries';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { CLIENTS, DISPATCHER, SHIPMENT_DETAIL } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';
import { routerMock } from '../../helpers/router';

const CREATED = (shipment: ShipmentDetail) => jsonResponse(201, { shipment });
const CLIENT_LIST = () => jsonResponse(200, { items: CLIENTS });
const FORBIDDEN = () => errorResponse(403, 'FORBIDDEN', 'Insufficient permissions');
const VALIDATION = (details: ErrorDetail[]) =>
  errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details });
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');
const SERVICE = 'Service is unavailable. Please try again.';
const NO_CLIENTS = 'No clients yet. A client has to register before a shipment can be created for them.';

const clientSelect = () => screen.getByRole('combobox', { name: 'Client' });
const originInput = () => screen.getByLabelText('Origin');
const destinationInput = () => screen.getByLabelText('Destination');
const descriptionInput = () => screen.getByLabelText('Description');
const weightInput = () => screen.getByLabelText('Weight (kg)');
const submitButton = () => screen.getByRole('button', { name: 'Create shipment' });
const noFurtherRequest = () => new Promise((resolve) => setTimeout(resolve, 50));

async function renderForm() {
  const result = renderWithQuery(<NewShipmentForm />);
  await screen.findByRole('option', { name: /Demo Client/ });
  return result;
}

type FillValues = { origin: string; destination: string; description: string };

function setup() {
  const user = userEvent.setup();
  const typeInto = async (input: HTMLElement, value: string) => {
    await user.click(input);
    await user.paste(value);
  };
  return {
    user,
    fill: async (overrides: Partial<FillValues> = {}) => {
      const values: FillValues = {
        origin: '  Odesa, UA ',
        destination: 'Kharkiv, UA',
        description: 'Box of spare machine parts',
        ...overrides,
      };
      await user.selectOptions(clientSelect(), screen.getByRole('option', { name: 'Demo Client — client@demo.dev' }));
      await typeInto(originInput(), values.origin);
      await typeInto(destinationInput(), values.destination);
      await typeInto(descriptionInput(), values.description);
    },
    submit: () => user.click(submitButton()),
  };
}

describe('NewShipmentForm', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });
    setCookie('csrf_token', 'tok_-1');
  });

  it('renders the fields, the submit button and the way back', async () => {
    mockFetch(CLIENT_LIST());
    await renderForm();

    expect(clientSelect()).toBeInTheDocument();
    expect(originInput().tagName).toBe('INPUT');
    expect(destinationInput().tagName).toBe('INPUT');
    expect(descriptionInput().tagName).toBe('INPUT');
    expect(weightInput()).toHaveAttribute('type', 'number');
    expect(weightInput()).not.toHaveAttribute('required');
    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(submitButton()).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/shipments');
    expect(submitButton().closest('form')).toHaveAttribute('novalidate');
  });

  it('shows the required-field messages on an empty submit and sends nothing', async () => {
    const { calls } = mockFetch(CLIENT_LIST());
    await renderForm();

    await setup().submit();

    expect(await screen.findByText('Enter the origin')).toBeInTheDocument();
    expect(clientSelect()).toHaveAccessibleDescription('Select a client');
    expect(originInput()).toHaveAccessibleDescription('Enter the origin');
    expect(destinationInput()).toHaveAccessibleDescription('Enter the destination');
    expect(descriptionInput()).toHaveAccessibleDescription('Enter a description');
    expect(weightInput()).toHaveAttribute('aria-invalid', 'false');
    expect(calls).toHaveLength(1);
    expect(clientSelect()).toHaveFocus();
  });

  it('posts the trimmed shipment without a weight, caches it and opens its detail', async () => {
    const { calls } = mockFetch(CLIENT_LIST(), CREATED(SHIPMENT_DETAIL));
    const { queryClient } = await renderForm();
    const { fill, submit } = setup();

    await fill();
    await submit();

    await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(routerMock.push).toHaveBeenCalledWith('/shipments/shp1');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.url).toBe('/api/v1/shipments');
    const body: unknown = JSON.parse(calls[1]?.body ?? '');
    expect(body).toEqual({
      clientId: 'u1',
      origin: 'Odesa, UA',
      destination: 'Kharkiv, UA',
      description: 'Box of spare machine parts',
    });
    expect(body).not.toHaveProperty('weightKg');
    expect(calls[1]?.headers.get('x-csrf-token')).toBe('tok_-1');
    expect(queryClient.getQueryData(shipmentKeys.detail('shp1'))).toEqual(SHIPMENT_DETAIL);
  });

  it('sends the weight as a number', async () => {
    const { calls } = mockFetch(CLIENT_LIST(), CREATED(SHIPMENT_DETAIL));
    await renderForm();
    const { user, fill, submit } = setup();

    await fill();
    await user.type(weightInput(), '8.2');
    await submit();

    await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/shipments/shp1'));
    expect((JSON.parse(calls[1]?.body ?? '') as { weightKg: unknown }).weightKg).toBe(8.2);
  });

  it.each([
    ['0', 'Weight must be greater than 0'],
    ['100001', 'Weight must be at most 100000 kg'],
  ])('rejects the weight %s', async (weight, message) => {
    const { calls } = mockFetch(CLIENT_LIST());
    await renderForm();
    const { user, fill, submit } = setup();

    await fill();
    await user.type(weightInput(), weight);
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(weightInput()).toHaveAccessibleDescription(message);
    expect(calls).toHaveLength(1);
  });

  it('rejects an origin longer than 200 characters', async () => {
    const { calls } = mockFetch(CLIENT_LIST());
    await renderForm();
    const { fill, submit } = setup();

    await fill({ origin: 'x'.repeat(201) });
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Origin must be at most 200 characters');
    expect(originInput()).toHaveAccessibleDescription('Origin must be at most 200 characters');
    expect(calls).toHaveLength(1);
  });

  it("puts the API's Client not found under the picker", async () => {
    mockFetch(CLIENT_LIST(), VALIDATION([{ path: 'clientId', message: 'Client not found' }]));
    await renderForm();
    const { fill, submit } = setup();

    await fill();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Client not found');
    expect(clientSelect()).toHaveAccessibleDescription('Client not found');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("shows the API's message of a 403 as a form-level alert", async () => {
    mockFetch(CLIENT_LIST(), FORBIDDEN());
    await renderForm();
    const { fill, submit } = setup();

    await fill();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient permissions');
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it.each([
    ['a 500', DOWN],
    ['a network failure', OFFLINE],
  ])('keeps what was typed on %s', async (_name, reply) => {
    mockFetch(CLIENT_LIST(), reply());
    await renderForm();
    const { fill, submit } = setup();

    await fill();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(SERVICE);
    expect(clientSelect()).toHaveValue('u1');
    expect(originInput()).toHaveValue('  Odesa, UA ');
    expect(destinationInput()).toHaveValue('Kharkiv, UA');
    expect(descriptionInput()).toHaveValue('Box of spare machine parts');
    expect(submitButton()).toBeEnabled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('clears the alert and navigates when a retry succeeds', async () => {
    const { calls } = mockFetch(CLIENT_LIST(), DOWN(), CREATED(SHIPMENT_DETAIL));
    await renderForm();
    const { fill, submit } = setup();

    await fill();
    await submit();
    await screen.findByRole('alert');
    await submit();

    await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/shipments/shp1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls).toHaveLength(3);
  });

  it('sends one request while one is in flight', async () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(CLIENT_LIST(), reply.promise);
    await renderForm();
    const { fill, submit } = setup();

    await fill();
    await submit();

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');
    await submit();
    await noFurtherRequest();
    expect(calls).toHaveLength(2);
    expect(routerMock.push).not.toHaveBeenCalled();

    reply.resolve(CREATED(SHIPMENT_DETAIL));

    await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
  });

  it('disables the submit button while the clients load', async () => {
    const clients = deferred<Response>();
    mockFetch(clients.promise);
    renderWithQuery(<NewShipmentForm />);

    expect(submitButton()).toBeDisabled();

    clients.resolve(CLIENT_LIST());

    await screen.findByRole('option', { name: /Demo Client/ });
    expect(submitButton()).toBeEnabled();
  });

  it('disables the submit button when the clients could not be loaded', async () => {
    mockFetch(DOWN());
    renderWithQuery(<NewShipmentForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load clients');
    expect(submitButton()).toBeDisabled();
  });

  it('disables the submit button when there are no clients', async () => {
    mockFetch(jsonResponse(200, { items: [] }));
    renderWithQuery(<NewShipmentForm />);

    expect(await screen.findByText(NO_CLIENTS)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });
});
