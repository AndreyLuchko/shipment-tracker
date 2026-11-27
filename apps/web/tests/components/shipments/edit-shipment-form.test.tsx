import type { ErrorDetail, ShipmentDetail } from '@shipment-tracker/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditShipmentForm } from '@/components/shipments/edit-shipment-form';

import { deferred, errorResponse, jsonResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { SHIPMENT_DETAIL } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';

const DETAIL = (shipment: ShipmentDetail) => jsonResponse(200, { shipment });
const VALIDATION = (details: ErrorDetail[]) =>
  errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details });
const DOWN = () => textResponse(500, 'Internal Server Error');
const SERVICE = 'Service is unavailable. Please try again.';

const renderForm = () => {
  const onClose = vi.fn();
  renderWithQuery(<EditShipmentForm shipment={SHIPMENT_DETAIL} onClose={onClose} />);
  return onClose;
};
const descriptionInput = () => screen.getByLabelText('Description');
const weightInput = () => screen.getByLabelText('Weight (kg)');
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const noFurtherRequest = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('EditShipmentForm', () => {
  beforeEach(() => {
    setCookie('csrf_token', 'tok_-1');
  });

  it("opens with the shipment's values and Save disabled", () => {
    renderForm();

    expect(descriptionInput()).toHaveValue('Box of spare machine parts');
    expect(weightInput()).toHaveValue(8.2);
    expect(weightInput()).toHaveAttribute('type', 'number');
    expect(weightInput()).toHaveAttribute('step', '0.1');
    expect(saveButton()).toBeDisabled();
  });

  it('sends only the changed description and closes as saved', async () => {
    const { calls } = mockFetch(DETAIL({ ...SHIPMENT_DETAIL, description: 'Two boxes' }));
    const onClose = renderForm();
    const user = userEvent.setup();

    await user.clear(descriptionInput());
    await user.type(descriptionInput(), 'Two boxes');
    await user.click(saveButton());

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PATCH');
    expect(calls[0]?.url).toBe('/api/v1/shipments/shp1');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ description: 'Two boxes' });
  });

  it('sends a cleared weight as null', async () => {
    const { calls } = mockFetch(DETAIL({ ...SHIPMENT_DETAIL, weightKg: null }));
    renderForm();
    const user = userEvent.setup();

    await user.clear(weightInput());
    await user.click(saveButton());

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ weightKg: null });
  });

  it('requires a description and sends nothing without one', async () => {
    const { calls } = mockFetch();
    const onClose = renderForm();
    const user = userEvent.setup();

    await user.clear(descriptionInput());
    await user.clear(weightInput());
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a description');
    expect(descriptionInput()).toHaveAccessibleDescription('Enter a description');
    expect(calls).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects a weight of 0', async () => {
    const { calls } = mockFetch();
    renderForm();
    const user = userEvent.setup();

    await user.clear(weightInput());
    await user.type(weightInput(), '0');
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Weight must be greater than 0');
    expect(calls).toHaveLength(0);
  });

  it('shows a validation error of the API under the field', async () => {
    mockFetch(VALIDATION([{ path: 'description', message: 'Description must be at most 500 characters' }]));
    renderForm();
    const user = userEvent.setup();

    await user.type(descriptionInput(), '!');
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Description must be at most 500 characters');
    expect(descriptionInput()).toHaveAccessibleDescription('Description must be at most 500 characters');
  });

  it('shows the service message and keeps the values on a 500', async () => {
    mockFetch(DOWN());
    const onClose = renderForm();
    const user = userEvent.setup();

    await user.type(descriptionInput(), '!');
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(SERVICE);
    expect(descriptionInput()).toHaveValue('Box of spare machine parts!');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends one request on a double click', async () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    const onClose = renderForm();
    const user = userEvent.setup();

    await user.type(descriptionInput(), '!');
    await user.dblClick(saveButton());
    await noFurtherRequest();
    expect(calls).toHaveLength(1);

    reply.resolve(DETAIL({ ...SHIPMENT_DETAIL, description: 'Box of spare machine parts!' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    expect(calls).toHaveLength(1);
  });

  it('closes unsaved on Cancel without a request', async () => {
    const { calls } = mockFetch();
    const onClose = renderForm();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledWith(false);
    expect(calls).toHaveLength(0);
  });
});
