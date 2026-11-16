import type { ErrorDetail, ShipmentDetail } from '@shipment-tracker/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StatusUpdateForm } from '@/components/shipments/status-update-form';
import { shipmentKeys } from '@/lib/shipments/queries';

import { deferred, errorResponse, jsonResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { DELIVERED_DETAIL, SHIPMENT_AFTER_EVENT, SHIPMENT_DETAIL } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';

const DETAIL = (shipment: ShipmentDetail) => jsonResponse(200, { shipment });
const CREATED = (shipment: ShipmentDetail) => jsonResponse(201, { shipment });
const NOT_FOUND = () => errorResponse(404, 'NOT_FOUND', 'Shipment not found');
const FORBIDDEN = () => errorResponse(403, 'FORBIDDEN', 'Insufficient permissions');
const ILLEGAL = () =>
  errorResponse(422, 'INVALID_STATUS_TRANSITION', 'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE');
const VALIDATION = (details: ErrorDetail[]) =>
  errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details });
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');
const SERVICE = 'Service is unavailable. Please try again.';

const renderForm = (shipment: ShipmentDetail = SHIPMENT_DETAIL) =>
  renderWithQuery(<StatusUpdateForm shipment={shipment} />);
const statusSelect = () => screen.getByLabelText('New status');
const locationInput = () => screen.getByLabelText('Location');
const noteInput = () => screen.getByLabelText('Note');
const submitButton = () => screen.getByRole('button', { name: 'Add update' });
const option = (name: string) => within(statusSelect()).getByRole('option', { name });
const noFurtherRequest = () => new Promise((resolve) => setTimeout(resolve, 50));

function setup() {
  const user = userEvent.setup();
  return {
    user,
    choose: (label: string) => user.selectOptions(statusSelect(), option(label)),
    submit: () => user.click(submitButton()),
  };
}

describe('StatusUpdateForm', () => {
  beforeEach(() => {
    setCookie('csrf_token', 'tok_-1');
  });

  it('offers all seven statuses with only the legal ones enabled', () => {
    renderForm();

    expect(screen.getByRole('heading', { level: 2, name: 'Add status update' })).toBeInTheDocument();
    const options = within(statusSelect()).getAllByRole('option');
    expect(options.map((element) => element.textContent)).toEqual([
      'Select a status',
      'Created',
      'Picked up',
      'In transit',
      'At warehouse',
      'Out for delivery',
      'Delivered',
      'Exception',
    ]);
    for (const name of ['In transit', 'At warehouse', 'Out for delivery', 'Exception']) {
      expect(option(name)).toBeEnabled();
    }
    for (const name of ['Created', 'Picked up', 'Delivered']) {
      expect(option(name)).toBeDisabled();
    }
    expect(statusSelect()).toHaveValue('');
    expect(locationInput().tagName).toBe('INPUT');
    expect(noteInput().tagName).toBe('TEXTAREA');
    expect(submitButton()).toHaveAttribute('type', 'submit');
    expect(submitButton().closest('form')).toHaveAttribute('novalidate');
  });

  it('shows a note instead of the form for a shipment in its final status', () => {
    renderForm(DELIVERED_DETAIL);

    expect(screen.getByRole('heading', { level: 2, name: 'Add status update' })).toBeInTheDocument();
    expect(
      screen.getByText('This shipment has reached its final status. No further updates can be added.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('New status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add update' })).not.toBeInTheDocument();
  });

  it('requires a status and sends nothing without one', async () => {
    const { calls } = mockFetch();
    renderForm();

    await setup().submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Select a status');
    expect(statusSelect()).toHaveAccessibleDescription('Select a status');
    expect(calls).toHaveLength(0);
  });

  it('rejects a note longer than 500 characters', async () => {
    const { calls } = mockFetch();
    renderForm();
    const { user, choose, submit } = setup();

    await choose('At warehouse');
    await user.click(noteInput());
    await user.paste('x'.repeat(501));
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Note must be at most 500 characters');
    expect(noteInput()).toHaveAccessibleDescription('Note must be at most 500 characters');
    expect(calls).toHaveLength(0);
  });

  it('posts the update without empty fields or occurredAt, then resets and confirms', async () => {
    const { calls } = mockFetch(CREATED(SHIPMENT_AFTER_EVENT));
    const { queryClient } = renderForm();
    const { user, choose, submit } = setup();

    await choose('At warehouse');
    await user.type(locationInput(), '  Kharkiv hub ');
    await submit();

    expect(await screen.findByRole('status')).toHaveTextContent('Update added.');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/shipments/shp1/events');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ status: 'AT_WAREHOUSE', location: 'Kharkiv hub' });
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
    expect(statusSelect()).toHaveValue('');
    expect(locationInput()).toHaveValue('');
    expect(queryClient.getQueryData(shipmentKeys.detail('shp1'))).toEqual(SHIPMENT_AFTER_EVENT);
  });

  it('allows the current status again (a second scan)', async () => {
    const { calls } = mockFetch(CREATED(SHIPMENT_AFTER_EVENT));
    renderForm();
    const { user, choose, submit } = setup();

    await choose('In transit');
    await user.type(noteInput(), 'second scan');
    await submit();

    expect(await screen.findByText('Update added.')).toBeInTheDocument();
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ status: 'IN_TRANSIT', note: 'second scan' });
  });

  it('treats a 200 (exact duplicate) as success', async () => {
    mockFetch(DETAIL(SHIPMENT_AFTER_EVENT));
    renderForm();
    const { choose, submit } = setup();

    await choose('At warehouse');
    await submit();

    expect(await screen.findByText('Update added.')).toBeInTheDocument();
  });

  it('explains an illegal transition, clears the status and invalidates the detail', async () => {
    const { calls } = mockFetch(ILLEGAL());
    const { queryClient } = renderForm();
    queryClient.setQueryData(shipmentKeys.detail('shp1'), SHIPMENT_DETAIL);
    const { user, choose, submit } = setup();

    await choose('At warehouse');
    await user.type(locationInput(), 'Kharkiv hub');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE',
    );
    await vi.waitFor(() => expect(statusSelect()).toHaveValue(''));
    expect(locationInput()).toHaveValue('Kharkiv hub');
    expect(screen.queryByText('Update added.')).not.toBeInTheDocument();
    expect(queryClient.getQueryState(shipmentKeys.detail('shp1'))?.isInvalidated).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('shows a validation error of a form field under that field', async () => {
    mockFetch(VALIDATION([{ path: 'location', message: 'Location must be at most 200 characters' }]));
    renderForm();
    const { choose, submit } = setup();

    await choose('At warehouse');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Location must be at most 200 characters');
    expect(locationInput()).toHaveAccessibleDescription('Location must be at most 200 characters');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows a validation error of a field the form does not have as a form-level alert', async () => {
    mockFetch(VALIDATION([{ path: 'occurredAt', message: 'occurredAt must not be in the future' }]));
    renderForm();
    const { choose, submit } = setup();

    await choose('At warehouse');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Request validation failed');
  });

  it.each([
    ['403', FORBIDDEN, 'Insufficient permissions'],
    ['404', NOT_FOUND, 'Shipment not found'],
  ])("shows the API's message of a %s", async (_name, reply, message) => {
    mockFetch(reply());
    renderForm();
    const { choose, submit } = setup();

    await choose('At warehouse');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it.each([
    ['a 500', DOWN],
    ['a network failure', OFFLINE],
  ])('keeps what was typed on %s', async (_name, reply) => {
    mockFetch(reply());
    renderForm();
    const { user, choose, submit } = setup();

    await choose('At warehouse');
    await user.type(locationInput(), 'Kharkiv hub');
    await user.type(noteInput(), 'late');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(SERVICE);
    expect(statusSelect()).toHaveValue('AT_WAREHOUSE');
    expect(locationInput()).toHaveValue('Kharkiv hub');
    expect(noteInput()).toHaveValue('late');
    expect(submitButton()).toBeEnabled();
  });

  it('sends one request while one is in flight', async () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    renderForm();
    const { choose, submit } = setup();

    await choose('At warehouse');
    await submit();

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');
    await submit();
    await noFurtherRequest();
    expect(calls).toHaveLength(1);

    reply.resolve(CREATED(SHIPMENT_AFTER_EVENT));

    expect(await screen.findByText('Update added.')).toBeInTheDocument();
  });

  it('hides the confirmation when the next submit fails', async () => {
    mockFetch(CREATED(SHIPMENT_AFTER_EVENT), DOWN());
    renderForm();
    const { choose, submit } = setup();

    await choose('At warehouse');
    await submit();
    await screen.findByText('Update added.');
    await choose('Exception');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(SERVICE);
    expect(screen.queryByText('Update added.')).not.toBeInTheDocument();
  });

  it('clears the alert when a retry succeeds', async () => {
    const { calls } = mockFetch(DOWN(), CREATED(SHIPMENT_AFTER_EVENT));
    renderForm();
    const { choose, submit } = setup();

    await choose('At warehouse');
    await submit();
    await screen.findByRole('alert');
    await submit();

    expect(await screen.findByText('Update added.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });
});
