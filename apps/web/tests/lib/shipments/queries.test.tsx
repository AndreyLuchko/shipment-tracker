import type { ShipmentDetail, ShipmentListResponse, ShipmentSummary } from '@shipment-tracker/shared';
import type { QueryKey } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/client';
import {
  clientKeys,
  shipmentKeys,
  useAddShipmentEvent,
  useClientsQuery,
  useCreateShipment,
  useShipmentQuery,
  useShipmentsQuery,
  useUpdateShipment,
} from '@/lib/shipments/queries';

import { deferred, errorResponse, jsonResponse, mockFetch, textResponse } from '../../helpers/fetch';
import {
  CLIENTS,
  EXCEPTION_SHIPMENT,
  listPage,
  SHIPMENT,
  SHIPMENT_AFTER_EVENT,
  SHIPMENT_DETAIL,
} from '../../helpers/fixtures';
import { createQueryWrapper } from '../../helpers/query';

const LIST = (items: ShipmentSummary[], options?: { page?: number; total?: number }) =>
  jsonResponse(200, listPage(items, options));
const DETAIL = (shipment: ShipmentDetail) => jsonResponse(200, { shipment });
const CREATED = (shipment: ShipmentDetail) => jsonResponse(201, { shipment });
const NOT_FOUND = () => errorResponse(404, 'NOT_FOUND', 'Shipment not found');
const FORBIDDEN = () => errorResponse(403, 'FORBIDDEN', 'Insufficient permissions');
const ILLEGAL = () =>
  errorResponse(422, 'INVALID_STATUS_TRANSITION', 'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE');
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CREATE_INPUT = {
  clientId: 'u1',
  origin: 'Odesa, UA',
  destination: 'Kharkiv, UA',
  description: 'Box of spare machine parts',
  weightKg: 8.2,
};

function setup() {
  const { queryClient, wrapper } = createQueryWrapper();
  const state = (key: QueryKey) => queryClient.getQueryState(key);
  return { queryClient, wrapper, state };
}

describe('cache keys', () => {
  it('are the documented arrays', () => {
    expect(shipmentKeys.lists()).toEqual(['shipments', 'list']);
    expect(shipmentKeys.list({ page: 1, sort: 'newest' })).toEqual(['shipments', 'list', { page: 1, sort: 'newest' }]);
    expect(shipmentKeys.detail('shp1')).toEqual(['shipments', 'detail', 'shp1']);
    expect(clientKeys.all).toEqual(['users', 'clients']);
  });
});

describe('useShipmentsQuery', () => {
  it('loads one page', async () => {
    const { wrapper } = setup();
    const { calls } = mockFetch(LIST([SHIPMENT]));

    const { result } = renderHook(() => useShipmentsQuery({ page: 1, sort: 'newest' }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(listPage([SHIPMENT])));
    expect(calls).toHaveLength(1);
  });

  it('keeps the previous page as placeholder data while the next one loads', async () => {
    const { wrapper } = setup();
    const second = deferred<Response>();
    mockFetch(LIST([SHIPMENT], { total: 21 }), second.promise);

    const { result, rerender } = renderHook(({ page }) => useShipmentsQuery({ page, sort: 'newest' }), {
      wrapper,
      initialProps: { page: 1 },
    });
    await waitFor(() => expect(result.current.data?.items).toEqual([SHIPMENT]));

    rerender({ page: 2 });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.items).toEqual([SHIPMENT]);
    expect(result.current.isPending).toBe(false);

    second.resolve(LIST([EXCEPTION_SHIPMENT], { page: 2, total: 21 }));
    await waitFor(() => expect(result.current.data?.items).toEqual([EXCEPTION_SHIPMENT]));
    expect(result.current.isPlaceholderData).toBe(false);
  });
});

describe('useShipmentQuery', () => {
  it('loads the detail', async () => {
    const { wrapper } = setup();
    mockFetch(DETAIL(SHIPMENT_DETAIL));

    const { result } = renderHook(() => useShipmentQuery('shp1'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(SHIPMENT_DETAIL));
  });

  it('surfaces NOT_FOUND without retrying', async () => {
    const { wrapper } = setup();
    const { calls } = mockFetch(NOT_FOUND());

    const { result } = renderHook(() => useShipmentQuery('nope'), { wrapper });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect((result.current.error as ApiError).code).toBe('NOT_FOUND');
    await pause(50);
    expect(calls).toHaveLength(1);
  });
});

describe('useClientsQuery', () => {
  it('loads the clients', async () => {
    const { wrapper } = setup();
    mockFetch(jsonResponse(200, { items: CLIENTS }));

    const { result } = renderHook(() => useClientsQuery(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(CLIENTS));
  });
});

describe('useCreateShipment', () => {
  it('writes the new detail and invalidates every list', async () => {
    const { queryClient, wrapper, state } = setup();
    queryClient.setQueryData<ShipmentListResponse>(shipmentKeys.list({ page: 1, sort: 'newest' }), listPage([]));
    mockFetch(CREATED(SHIPMENT_DETAIL));

    const { result } = renderHook(() => useCreateShipment(), { wrapper });
    let created: ShipmentDetail | undefined;
    await act(async () => {
      created = await result.current.mutateAsync(CREATE_INPUT);
    });

    expect(created).toEqual(SHIPMENT_DETAIL);
    expect(queryClient.getQueryData(shipmentKeys.detail('shp1'))).toEqual(SHIPMENT_DETAIL);
    expect(state(shipmentKeys.list({ page: 1, sort: 'newest' }))?.isInvalidated).toBe(true);
  });

  it('writes nothing and invalidates nothing when the request fails', async () => {
    const { queryClient, wrapper, state } = setup();
    queryClient.setQueryData<ShipmentListResponse>(shipmentKeys.list({ page: 1, sort: 'newest' }), listPage([]));
    mockFetch(FORBIDDEN());

    const { result } = renderHook(() => useCreateShipment(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync(CREATE_INPUT).catch((e: unknown) => e);
    });

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('FORBIDDEN');
    expect(state(shipmentKeys.detail('shp1'))).toBeUndefined();
    expect(state(shipmentKeys.list({ page: 1, sort: 'newest' }))?.isInvalidated).toBe(false);
  });
});

describe('useAddShipmentEvent', () => {
  function seeded() {
    const context = setup();
    context.queryClient.setQueryData<ShipmentDetail>(shipmentKeys.detail('shp1'), SHIPMENT_DETAIL);
    context.queryClient.setQueryData<ShipmentListResponse>(
      shipmentKeys.list({ page: 1, sort: 'newest' }),
      listPage([SHIPMENT]),
    );
    return context;
  }

  async function submit(wrapper: ReturnType<typeof setup>['wrapper']): Promise<unknown> {
    const { result } = renderHook(() => useAddShipmentEvent('shp1'), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({ status: 'AT_WAREHOUSE' }).catch((e: unknown) => e);
    });
    return outcome;
  }

  it('replaces the detail with the returned shipment and invalidates the lists', async () => {
    const { queryClient, wrapper, state } = seeded();
    const { calls } = mockFetch(CREATED(SHIPMENT_AFTER_EVENT));

    await expect(submit(wrapper)).resolves.toEqual(SHIPMENT_AFTER_EVENT);
    expect(queryClient.getQueryData(shipmentKeys.detail('shp1'))).toEqual(SHIPMENT_AFTER_EVENT);
    expect(state(shipmentKeys.detail('shp1'))?.isInvalidated).toBe(false);
    expect(state(shipmentKeys.list({ page: 1, sort: 'newest' }))?.isInvalidated).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('invalidates the stale detail on INVALID_STATUS_TRANSITION', async () => {
    const { queryClient, wrapper, state } = seeded();
    mockFetch(ILLEGAL());

    const error = await submit(wrapper);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_STATUS_TRANSITION');
    expect(queryClient.getQueryData(shipmentKeys.detail('shp1'))).toEqual(SHIPMENT_DETAIL);
    expect(state(shipmentKeys.detail('shp1'))?.isInvalidated).toBe(true);
  });

  it.each([
    ['the API is down', DOWN],
    ['the network is offline', OFFLINE],
  ])('leaves the detail alone when %s', async (_label, reply) => {
    const { queryClient, wrapper, state } = seeded();
    mockFetch(reply());

    const error = await submit(wrapper);
    expect(error).toBeInstanceOf(Error);
    expect(queryClient.getQueryData(shipmentKeys.detail('shp1'))).toEqual(SHIPMENT_DETAIL);
    expect(state(shipmentKeys.detail('shp1'))?.isInvalidated).toBe(false);
  });
});

describe('useUpdateShipment', () => {
  it('replaces the detail with the returned shipment and invalidates the lists', async () => {
    const { queryClient, wrapper, state } = setup();
    queryClient.setQueryData<ShipmentDetail>(shipmentKeys.detail('shp1'), SHIPMENT_DETAIL);
    queryClient.setQueryData<ShipmentListResponse>(
      shipmentKeys.list({ page: 1, sort: 'newest' }),
      listPage([SHIPMENT]),
    );
    const updated: ShipmentDetail = { ...SHIPMENT_DETAIL, description: 'Two boxes' };
    const { calls } = mockFetch(DETAIL(updated));
    const { result } = renderHook(() => useUpdateShipment('shp1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ description: 'Two boxes' });
    });

    expect(calls[0]?.method).toBe('PATCH');
    expect(queryClient.getQueryData(shipmentKeys.detail('shp1'))).toEqual(updated);
    expect(state(shipmentKeys.list({ page: 1, sort: 'newest' }))?.isInvalidated).toBe(true);
  });
});
