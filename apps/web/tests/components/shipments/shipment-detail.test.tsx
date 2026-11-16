import type { ShipmentDetail } from '@shipment-tracker/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShipmentDetailView } from '@/components/shipments/shipment-detail';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import { DELIVERED_DETAIL, NOW, SHIPMENT_DETAIL, USER } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';

const DETAIL = (shipment: ShipmentDetail) => jsonResponse(200, { shipment });
const NOT_FOUND = () => errorResponse(404, 'NOT_FOUND', 'Shipment not found');
const FORBIDDEN = () => errorResponse(403, 'FORBIDDEN', 'Insufficient permissions');
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');
const SERVICE = 'Service is unavailable. Please try again.';

const renderDetail = (id = 'shp1') => renderWithQuery(<ShipmentDetailView id={id} />);
const backLink = () => screen.getByRole('link', { name: 'Back to shipments' });
const noFurtherRequest = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('ShipmentDetailView', () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
    useAuthStore.setState({ status: 'authenticated', user: USER });
  });

  it('shows a skeleton while loading, then the shipment', async () => {
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    renderDetail();

    expect(screen.getByRole('status', { name: 'Loading shipment' })).toBeInTheDocument();
    expect(backLink()).toHaveAttribute('href', '/shipments');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    reply.resolve(DETAIL(SHIPMENT_DETAIL));

    expect(await screen.findByRole('heading', { level: 1, name: 'ST-2026-000002' })).toBeInTheDocument();
    expect(screen.getByText('In transit')).toBeInTheDocument();
    expect(screen.getByText('Route', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading shipment' })).not.toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/v1/shipments/shp1');
  });

  it('shows a delivered shipment', async () => {
    mockFetch(DETAIL(DELIVERED_DETAIL));
    renderDetail('shp3');

    expect(await screen.findByRole('heading', { level: 1, name: 'ST-2026-000001' })).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('shows "Shipment not found" on a 404', async () => {
    const { calls } = mockFetch(NOT_FOUND());
    renderDetail('nope');

    expect(await screen.findByText('Shipment not found')).toBeInTheDocument();
    expect(screen.getByText('It does not exist or you do not have access to it.')).toBeInTheDocument();
    expect(backLink()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await noFurtherRequest();
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['400', () => errorResponse(400, 'BAD_REQUEST', 'Bad Request')],
    ['414', () => errorResponse(414, 'BAD_REQUEST', 'URI Too Long')],
  ])('treats a %s BAD_REQUEST as not found', async (_status, reply) => {
    mockFetch(reply());
    renderDetail('%zz');

    expect(await screen.findByText('Shipment not found')).toBeInTheDocument();
  });

  it('sends the id as one encoded path segment', async () => {
    const { calls } = mockFetch(NOT_FOUND());
    renderDetail('../users');

    expect(await screen.findByText('Shipment not found')).toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/v1/shipments/..%2Fusers');
  });

  it.each([
    ['the API is down', DOWN],
    ['the network is offline', OFFLINE],
  ])('shows an error with "Try again" when %s', async (_name, reply) => {
    mockFetch(reply());
    renderDetail();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the shipment');
    expect(alert).toHaveTextContent(SERVICE);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(backLink()).toBeInTheDocument();
  });

  it("shows the API's message of a 403", async () => {
    mockFetch(FORBIDDEN());
    renderDetail();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Insufficient permissions');
    expect(screen.queryByText('Shipment not found')).not.toBeInTheDocument();
  });

  it('loads again on "Try again"', async () => {
    const { calls } = mockFetch(DOWN(), DETAIL(SHIPMENT_DETAIL));
    renderDetail();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'ST-2026-000002' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  it('ends the session on a 401', async () => {
    mockFetch(UNAUTH());
    renderDetail();

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'));
  });

  it('keeps the last good data when a refetch fails', async () => {
    mockFetch(DETAIL(SHIPMENT_DETAIL), DOWN());
    const { queryClient } = renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'ST-2026-000002' });

    await act(() => queryClient.refetchQueries());

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh. Showing the last loaded data.');
    expect(screen.getByRole('heading', { level: 1, name: 'ST-2026-000002' })).toBeInTheDocument();
    expect(screen.getByText('Route', { selector: 'dt' })).toBeInTheDocument();
  });
});
