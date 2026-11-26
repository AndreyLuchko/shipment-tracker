import type { PublicUser, ShipmentSummary } from '@shipment-tracker/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShipmentsList } from '@/components/shipments/shipments-list';
import { useAuthStore } from '@/stores/auth';

import { deferred, errorResponse, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import { DISPATCHER, EXCEPTION_SHIPMENT, listPage, NOW, SHIPMENT, USER } from '../../helpers/fixtures';
import { renderWithQuery } from '../../helpers/query';
import { navigate } from '../../helpers/router';
import { advance, fakeTimeouts } from '../../helpers/timers';

const NOTICE = 'Waking up the demo server. The first request after a quiet spell can take up to a minute.';

const LIST = (items: ShipmentSummary[], options?: { page?: number; total?: number }) =>
  jsonResponse(200, listPage(items, options));
const FORBIDDEN = () => errorResponse(403, 'FORBIDDEN', 'Insufficient permissions');
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');
const SERVICE = 'Service is unavailable. Please try again.';

const signIn = (user: PublicUser = DISPATCHER) => useAuthStore.setState({ status: 'authenticated', user });
const bodyRows = () => screen.getAllByRole('row').slice(1);
const renderList = () => renderWithQuery(<ShipmentsList />);

describe('ShipmentsList', () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
    navigate('/shipments');
  });

  it('shows a skeleton on the first load, then the table', async () => {
    signIn();
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);
    renderList();

    expect(screen.getByRole('heading', { level: 1, name: 'Shipments' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading shipments' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    reply.resolve(LIST([SHIPMENT, EXCEPTION_SHIPMENT]));

    await screen.findByRole('table');
    expect(bodyRows()).toHaveLength(2);
    expect(screen.queryByRole('status', { name: 'Loading shipments' })).not.toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/v1/shipments?page=1');
  });

  it('explains a slow first load after 3 s, then shows the table without the notice', async () => {
    fakeTimeouts();
    signIn();
    const reply = deferred<Response>();
    mockFetch(reply.promise);
    renderList();

    expect(screen.getByRole('status', { name: 'Loading shipments' })).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    await advance(3_000);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();

    reply.resolve(LIST([SHIPMENT]));
    await advance(0);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('shows a dispatcher the Client column and "New shipment"', async () => {
    signIn(DISPATCHER);
    mockFetch(LIST([SHIPMENT]));
    renderList();

    expect(await screen.findByRole('columnheader', { name: 'Client' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New shipment' })).toHaveAttribute('href', '/shipments/new');
  });

  it('hides the Client column and "New shipment" from a client', async () => {
    signIn(USER);
    mockFetch(LIST([SHIPMENT]));
    renderList();

    await screen.findByRole('table');
    expect(screen.queryByRole('columnheader', { name: 'Client' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New shipment' })).not.toBeInTheDocument();
  });

  it('requests the view the URL names', async () => {
    signIn();
    navigate('/shipments?status=EXCEPTION&search=kyiv&page=2');
    const { calls } = mockFetch(LIST([EXCEPTION_SHIPMENT], { page: 2, total: 21 }));
    renderList();

    await screen.findByRole('table');
    expect(calls[0]?.url).toBe('/api/v1/shipments?status=EXCEPTION&search=kyiv&page=2');
  });

  it('requests the sort the URL names', async () => {
    signIn();
    navigate('/shipments?sort=stale');
    const { calls } = mockFetch(LIST([SHIPMENT]));
    renderList();

    await screen.findByRole('table');
    expect(calls[0]?.url).toBe('/api/v1/shipments?sort=stale&page=1');
  });

  it('falls back to defaults for invalid URL values', async () => {
    signIn();
    navigate('/shipments?status=LOST&page=abc');
    const { calls } = mockFetch(LIST([SHIPMENT]));
    renderList();

    await screen.findByRole('table');
    expect(calls[0]?.url).toBe('/api/v1/shipments?page=1');
  });

  it('tells a dispatcher how to create the first shipment', async () => {
    signIn(DISPATCHER);
    mockFetch(LIST([]));
    renderList();

    expect(await screen.findByText('No shipments yet.')).toBeInTheDocument();
    expect(screen.getByText('Create the first one with "New shipment".')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('tells a client where shipments will appear', async () => {
    signIn(USER);
    mockFetch(LIST([]));
    renderList();

    expect(await screen.findByText('No shipments yet.')).toBeInTheDocument();
    expect(screen.getByText('Shipments assigned to you will appear here.')).toBeInTheDocument();
  });

  it.each(['/shipments?status=DELIVERED', '/shipments?search=nothing'])(
    'offers to clear the filters on %s',
    async (href) => {
      signIn();
      navigate(href);
      mockFetch(LIST([]));
      renderList();

      expect(await screen.findByText('No shipments match your filters.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/shipments');
    },
  );

  it('keeps the sort on "Clear filters"', async () => {
    signIn();
    navigate('/shipments?search=zzz&sort=stale');
    mockFetch(LIST([]));
    renderList();

    expect(await screen.findByText('No shipments match your filters.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/shipments?sort=stale');
  });

  it.each([
    ['/shipments?page=5', '/shipments'],
    ['/shipments?status=EXCEPTION&page=5', '/shipments?status=EXCEPTION'],
  ])('offers the first page on %s past the end', async (href, firstPage) => {
    signIn();
    navigate(href);
    mockFetch(LIST([], { page: 5, total: 21 }));
    renderList();

    expect(await screen.findByText('No shipments on this page.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the first page' })).toHaveAttribute('href', firstPage);
  });

  it.each([
    ['the API is down', DOWN],
    ['the network is offline', OFFLINE],
  ])('shows an error with "Try again" when %s', async (_name, reply) => {
    signIn();
    // An unavailable reply is retried once, so it is answered twice.
    mockFetch(reply(), reply());
    renderList();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load shipments');
    expect(alert).toHaveTextContent(SERVICE);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it("shows the API's message of a 403", async () => {
    signIn();
    mockFetch(FORBIDDEN());
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient permissions');
  });

  it('loads again on "Try again"', async () => {
    signIn();
    const { calls } = mockFetch(DOWN(), LIST([SHIPMENT]));
    renderList();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }));

    await screen.findByRole('table');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  it('ends the session on a 401', async () => {
    signIn(USER);
    mockFetch(UNAUTH());
    renderList();

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'));
  });

  it('keeps the last good data when a refetch fails', async () => {
    signIn();
    mockFetch(LIST([SHIPMENT]), DOWN());
    const { queryClient } = renderList();
    await screen.findByRole('link', { name: 'ST-2026-000002' });

    await act(() => queryClient.refetchQueries());

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh. Showing the last loaded data.');
    expect(screen.getByRole('link', { name: 'ST-2026-000002' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  describe('filters and pagination', () => {
    beforeEach(() => signIn(USER));

    it('loads the chosen status', async () => {
      const { calls } = mockFetch(LIST([SHIPMENT, EXCEPTION_SHIPMENT]), LIST([EXCEPTION_SHIPMENT]));
      renderList();
      await vi.waitFor(() => expect(bodyRows()).toHaveLength(2));

      await userEvent.setup().selectOptions(screen.getByLabelText('Status'), 'EXCEPTION');

      await vi.waitFor(() => expect(calls[1]?.url).toBe('/api/v1/shipments?status=EXCEPTION&page=1'));
      await vi.waitFor(() => expect(bodyRows()).toHaveLength(1));
    });

    it('sends one request for the settled search text, not one per key', async () => {
      const { calls } = mockFetch(LIST([SHIPMENT, EXCEPTION_SHIPMENT]), LIST([EXCEPTION_SHIPMENT]));
      renderList();
      await vi.waitFor(() => expect(bodyRows()).toHaveLength(2));

      await userEvent.setup().type(screen.getByLabelText('Search'), 'kyiv');

      await vi.waitFor(() => expect(calls[1]?.url).toBe('/api/v1/shipments?search=kyiv&page=1'));
      await vi.waitFor(() => expect(bodyRows()).toHaveLength(1));
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
      expect(calls).toHaveLength(2);
    });

    it('keeps the previous rows while the next page loads', async () => {
      navigate('/shipments?page=2');
      const next = deferred<Response>();
      const { calls } = mockFetch(LIST([SHIPMENT], { page: 2, total: 45 }), next.promise);
      renderList();

      await userEvent.setup().click(await screen.findByRole('button', { name: 'Next' }));

      await vi.waitFor(() => expect(calls[1]?.url).toBe('/api/v1/shipments?page=3'));
      expect(screen.getByRole('link', { name: 'ST-2026-000002' })).toBeInTheDocument();
      expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByRole('status', { name: 'Loading shipments' })).not.toBeInTheDocument();

      next.resolve(LIST([EXCEPTION_SHIPMENT], { page: 3, total: 45 }));

      expect(await screen.findByRole('link', { name: 'ST-2026-000003' })).toBeInTheDocument();
      expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy');
      expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    });

    it('shows the count and the toolbar with the table', async () => {
      mockFetch(LIST([SHIPMENT]));
      renderList();

      expect(await screen.findByText('1 shipment')).toBeInTheDocument();
      expect(screen.getByLabelText('Search')).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
    });

    it('shows the toolbar but no count or pagination when the list is empty', async () => {
      mockFetch(LIST([]));
      renderList();

      await screen.findByText('No shipments yet.');
      expect(screen.getByLabelText('Search')).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
      expect(screen.queryByText(/\bshipments?$/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('resets the toolbar and reloads when the filters are cleared', async () => {
      navigate('/shipments?status=DELIVERED');
      const { calls } = mockFetch(LIST([]), LIST([SHIPMENT]));
      renderList();
      await screen.findByText('No shipments match your filters.');

      act(() => navigate('/shipments'));

      expect(screen.getByLabelText('Status')).toHaveValue('');
      await vi.waitFor(() => expect(bodyRows()).toHaveLength(1));
      expect(calls[1]?.url).toBe('/api/v1/shipments?page=1');
    });

    it('shows the toolbar above the error, so the filter that caused it can be changed', async () => {
      mockFetch(DOWN());
      renderList();

      const alert = await screen.findByRole('alert');
      const toolbarSelect = screen.getByLabelText('Status');
      expect(toolbarSelect.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
