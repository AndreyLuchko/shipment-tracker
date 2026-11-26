import type { ShipmentDetail } from '@shipment-tracker/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShipmentDetailView } from '@/components/shipments/shipment-detail';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { DELIVERED_DETAIL, DISPATCHER, NOW, SHIPMENT_AFTER_EVENT, SHIPMENT_DETAIL, USER } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';

const DETAIL = (shipment: ShipmentDetail) => jsonResponse(200, { shipment });
const CREATED = (shipment: ShipmentDetail) => jsonResponse(201, { shipment });
const ILLEGAL = () =>
  errorResponse(422, 'INVALID_STATUS_TRANSITION', 'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE');
const NOT_FOUND = () => errorResponse(404, 'NOT_FOUND', 'Shipment not found');
const FORBIDDEN = () => errorResponse(403, 'FORBIDDEN', 'Insufficient permissions');
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');
const SERVICE = 'Service is unavailable. Please try again.';

const renderDetail = (id = 'shp1') => renderWithQuery(<ShipmentDetailView id={id} />);
const backLink = () => screen.getByRole('link', { name: 'Back to shipments' });
const noFurtherRequest = () => new Promise((resolve) => setTimeout(resolve, 50));
const timelineEntries = () => within(screen.getByRole('list', { name: 'Movement timeline' })).getAllByRole('listitem');
const refreshButton = () => screen.getByRole('button', { name: 'Refresh' });

/** The badge next to the level-1 heading — the timeline repeats status labels. */
function headingBadge(): HTMLElement {
  const badge = screen.getByRole('heading', { level: 1 }).nextElementSibling;
  if (!(badge instanceof HTMLElement)) throw new Error('No badge next to the heading');
  return badge;
}

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
    expect(headingBadge()).toHaveTextContent('In transit');
    expect(screen.getByText('Route', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading shipment' })).not.toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/v1/shipments/shp1');
  });

  it('shows a delivered shipment', async () => {
    mockFetch(DETAIL(DELIVERED_DETAIL));
    renderDetail('shp3');

    expect(await screen.findByRole('heading', { level: 1, name: 'ST-2026-000001' })).toBeInTheDocument();
    expect(headingBadge()).toHaveTextContent('Delivered');
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
    // An unavailable reply is retried once, so it is answered twice.
    mockFetch(reply(), reply());
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

  it('shows the timeline with a "Refresh" button', async () => {
    mockFetch(DETAIL(SHIPMENT_DETAIL));
    renderDetail();

    expect(await screen.findByRole('heading', { level: 2, name: 'Timeline' })).toBeInTheDocument();
    expect(timelineEntries()).toHaveLength(3);
    expect(refreshButton()).toHaveAttribute('type', 'button');
  });

  it('loads the shipment again on "Refresh"', async () => {
    const { calls } = mockFetch(DETAIL(SHIPMENT_DETAIL), DETAIL(SHIPMENT_AFTER_EVENT));
    renderDetail();
    await screen.findByRole('list', { name: 'Movement timeline' });

    await userEvent.setup().click(refreshButton());

    await vi.waitFor(() => expect(timelineEntries()).toHaveLength(4));
    expect(headingBadge()).toHaveTextContent('At warehouse');
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toBe('/api/v1/shipments/shp1');
      expect(call.method).toBe('GET');
    }
  });

  it('disables "Refresh" while the shipment reloads', async () => {
    const second = deferred<Response>();
    const { calls } = mockFetch(DETAIL(SHIPMENT_DETAIL), second.promise);
    renderDetail();
    await screen.findByRole('list', { name: 'Movement timeline' });
    const user = userEvent.setup();

    await user.click(refreshButton());

    await vi.waitFor(() => expect(refreshButton()).toBeDisabled());
    expect(refreshButton()).toHaveAttribute('aria-busy', 'true');
    expect(timelineEntries()).toHaveLength(3);
    await user.click(refreshButton());
    expect(calls).toHaveLength(2);

    second.resolve(DETAIL(SHIPMENT_AFTER_EVENT));

    await vi.waitFor(() => expect(timelineEntries()).toHaveLength(4));
  });

  it('keeps the timeline when "Refresh" fails', async () => {
    mockFetch(DETAIL(SHIPMENT_DETAIL), DOWN());
    renderDetail();
    await screen.findByRole('list', { name: 'Movement timeline' });

    await userEvent.setup().click(refreshButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh. Showing the last loaded data.');
    expect(timelineEntries()).toHaveLength(3);
    await vi.waitFor(() => expect(refreshButton()).toBeEnabled());
  });
});

describe('ShipmentDetailView — the status update form', () => {
  const formHeading = () => screen.queryByRole('heading', { level: 2, name: 'Add status update' });
  const statusSelect = () => screen.getByLabelText('New status');
  const option = (name: string) => within(statusSelect()).getByRole('option', { name });

  async function submitStatus(label: string): Promise<void> {
    const user = userEvent.setup();
    await user.selectOptions(statusSelect(), option(label));
    await user.click(screen.getByRole('button', { name: 'Add update' }));
  }

  beforeEach(() => {
    vi.setSystemTime(NOW);
    setCookie('csrf_token', 'tok_-1');
    useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });
  });

  it('shows the form below the timeline to a dispatcher', async () => {
    mockFetch(DETAIL(SHIPMENT_DETAIL));
    renderDetail();

    const heading = await screen.findByRole('heading', { level: 2, name: 'Add status update' });
    const timeline = screen.getByRole('list', { name: 'Movement timeline' });
    expect(timeline.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no form to a client', async () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });
    mockFetch(DETAIL(SHIPMENT_DETAIL));
    renderDetail();

    await screen.findByRole('list', { name: 'Movement timeline' });
    expect(formHeading()).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New status')).not.toBeInTheDocument();
  });

  it('adds the new entry from the response without refetching the detail', async () => {
    const { calls } = mockFetch(DETAIL(SHIPMENT_DETAIL), CREATED(SHIPMENT_AFTER_EVENT));
    renderDetail();
    await screen.findByRole('heading', { level: 2, name: 'Add status update' });

    await submitStatus('At warehouse');

    await vi.waitFor(() => expect(timelineEntries()).toHaveLength(4));
    const last = timelineEntries().at(-1);
    expect(last).toHaveTextContent('At warehouse');
    expect(last).toHaveAttribute('aria-current', 'step');
    expect(headingBadge()).toHaveTextContent('At warehouse');
    await noFurtherRequest();
    expect(calls).toHaveLength(2);
  });

  it('refetches a stale detail after an illegal transition', async () => {
    const STALE: ShipmentDetail = {
      ...SHIPMENT_DETAIL,
      status: 'OUT_FOR_DELIVERY',
      allowedNextStatuses: ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
    };
    const { calls } = mockFetch(DETAIL(SHIPMENT_DETAIL), ILLEGAL(), DETAIL(STALE));
    renderDetail();
    await screen.findByRole('heading', { level: 2, name: 'Add status update' });

    await submitStatus('At warehouse');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE',
    );
    await vi.waitFor(() => {
      expect(option('At warehouse')).toBeDisabled();
      expect(option('Delivered')).toBeEnabled();
    });
    expect(headingBadge()).toHaveTextContent('Out for delivery');
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE');
    expect(calls).toHaveLength(3);
    expect(calls[2]?.method).toBe('GET');
    expect(calls[2]?.url).toBe('/api/v1/shipments/shp1');
  });

  it('shows the final-status note for a delivered shipment', async () => {
    mockFetch(DETAIL(DELIVERED_DETAIL));
    renderDetail('shp3');

    expect(
      await screen.findByText('This shipment has reached its final status. No further updates can be added.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add update' })).not.toBeInTheDocument();
  });
});
