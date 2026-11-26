import type { CreateShipmentInput, ShipmentDetail, ShipmentSummary } from '@shipment-tracker/shared';
import { describe, expect, it } from 'vitest';

import { addShipmentEvent, createShipment, fetchShipment, fetchShipments } from '@/lib/api/shipments';
import { ApiError, NetworkError } from '@/lib/api/client';
import { waitBeforeRetry } from '@/lib/api/retry-delay';

import { errorResponse, jsonResponse, mockFetch, setCookie } from '../../helpers/fetch';
import { EXCEPTION_SHIPMENT, listPage, SHIPMENT, SHIPMENT_AFTER_EVENT, SHIPMENT_DETAIL } from '../../helpers/fixtures';

const LIST = (items: ShipmentSummary[], options?: { page?: number; total?: number }) =>
  jsonResponse(200, listPage(items, options));
const DETAIL = (shipment: ShipmentDetail) => jsonResponse(200, { shipment });
const CREATED = (shipment: ShipmentDetail) => jsonResponse(201, { shipment });
const NOT_FOUND = () => errorResponse(404, 'NOT_FOUND', 'Shipment not found');
const ILLEGAL = () =>
  errorResponse(422, 'INVALID_STATUS_TRANSITION', 'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE');

const OFFLINE = () => new TypeError('Failed to fetch');

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('fetchShipments', () => {
  it('requests the first page and resolves the parsed list', async () => {
    const { calls } = mockFetch(LIST([SHIPMENT, EXCEPTION_SHIPMENT]));

    await expect(fetchShipments({ page: 1 })).resolves.toEqual(listPage([SHIPMENT, EXCEPTION_SHIPMENT]));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('/api/v1/shipments?page=1');
  });

  it('sends status, search and page in that order, form-encoded', async () => {
    const { calls } = mockFetch(LIST([]));

    await fetchShipments({ status: 'EXCEPTION', search: 'kyiv hub & co', page: 2 });
    expect(calls[0]?.url).toBe('/api/v1/shipments?status=EXCEPTION&search=kyiv+hub+%26+co&page=2');
  });

  it('leaves out undefined status and search', async () => {
    const { calls } = mockFetch(LIST([]));

    await fetchShipments({ status: undefined, search: undefined, page: 3 });
    expect(calls[0]?.url).toBe('/api/v1/shipments?page=3');
  });

  it('rejects a body that does not match the schema', async () => {
    // A 2xx body that is not the contract looks like a loading page, so the safe request is sent twice.
    mockFetch(jsonResponse(200, { items: [{ id: 1 }] }), jsonResponse(200, { items: [{ id: 1 }] }));

    const error = await rejection(fetchShipments({ page: 1 }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INTERNAL_ERROR');
  });
});

describe('fetchShipment', () => {
  it('requests the detail and resolves the shipment', async () => {
    const { calls } = mockFetch(DETAIL(SHIPMENT_DETAIL));

    await expect(fetchShipment('shp1')).resolves.toEqual(SHIPMENT_DETAIL);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('/api/v1/shipments/shp1');
  });

  it('sends the id as one encoded path segment', async () => {
    const { calls } = mockFetch(NOT_FOUND());

    const error = await rejection(fetchShipment('../users?role=CLIENT'));
    expect(calls[0]?.url).toBe('/api/v1/shipments/..%2Fusers%3Frole%3DCLIENT');
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('createShipment', () => {
  const input = {
    clientId: 'u1',
    origin: 'Odesa, UA',
    destination: 'Kharkiv, UA',
    description: 'Box of spare machine parts',
    weightKg: 8.2,
  };

  it('posts the input with the CSRF header and resolves the created shipment', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(CREATED(SHIPMENT_DETAIL));

    await expect(createShipment(input)).resolves.toEqual(SHIPMENT_DETAIL);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/shipments');
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual(input);
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
  });

  it('does not send weightKg when it is absent', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(CREATED(SHIPMENT_DETAIL));
    const withoutWeight: CreateShipmentInput = { ...input };
    delete withoutWeight.weightKg;

    await createShipment(withoutWeight);
    expect('weightKg' in JSON.parse(calls[0]?.body ?? '{}')).toBe(false);
  });
});

describe('addShipmentEvent', () => {
  const call = () => addShipmentEvent('shp1', { status: 'AT_WAREHOUSE', location: 'Kharkiv hub' });

  it('posts only the given fields and resolves the shipment after the event', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(CREATED(SHIPMENT_AFTER_EVENT));

    await expect(call()).resolves.toEqual(SHIPMENT_AFTER_EVENT);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/shipments/shp1/events');
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual({ status: 'AT_WAREHOUSE', location: 'Kharkiv hub' });
    expect(calls[0]?.headers.has('x-csrf-token')).toBe(true);
  });

  it('treats a 200 (exact duplicate) as success', async () => {
    mockFetch(DETAIL(SHIPMENT_AFTER_EVENT));

    await expect(call()).resolves.toEqual(SHIPMENT_AFTER_EVENT);
  });

  it('rejects an illegal transition with the API error', async () => {
    mockFetch(ILLEGAL());

    const error = await rejection(call());
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'INVALID_STATUS_TRANSITION',
      message: 'Cannot transition from OUT_FOR_DELIVERY to AT_WAREHOUSE',
    });
  });
});

describe('the one retry', () => {
  it.each([
    ['fetchShipments', () => fetchShipments({ page: 1 }), LIST([SHIPMENT]), listPage([SHIPMENT])],
    ['fetchShipment', () => fetchShipment('shp1'), DETAIL(SHIPMENT_DETAIL), SHIPMENT_DETAIL],
  ])('%s is sent again after OFFLINE', async (_name, run, reply, expected) => {
    const { calls } = mockFetch(OFFLINE(), reply);

    await expect(run()).resolves.toEqual(expected);
    expect(calls).toHaveLength(2);
    expect(waitBeforeRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['createShipment', () => createShipment({} as CreateShipmentInput)],
    ['addShipmentEvent', () => addShipmentEvent('shp1', { status: 'AT_WAREHOUSE', location: 'Kharkiv hub' })],
  ])('%s is not sent again after OFFLINE', async (_name, run) => {
    const { calls } = mockFetch(OFFLINE());

    await expect(run()).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(1);
    expect(waitBeforeRetry).not.toHaveBeenCalled();
  });
});
