import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/client';
import { waitBeforeRetry } from '@/lib/api/retry-delay';
import { fetchClients } from '@/lib/api/users';

import { errorResponse, jsonResponse, mockFetch } from '../../helpers/fetch';
import { CLIENTS, OTHER_CLIENT } from '../../helpers/fixtures';

describe('fetchClients', () => {
  it('requests the clients and resolves them', async () => {
    const { calls } = mockFetch(jsonResponse(200, { items: CLIENTS }));

    await expect(fetchClients()).resolves.toEqual(CLIENTS);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('/api/v1/users?role=CLIENT');
  });

  it('drops keys the schema does not know', async () => {
    mockFetch(jsonResponse(200, { items: [{ ...OTHER_CLIENT, passwordHash: 'x' }] }));

    await expect(fetchClients()).resolves.toEqual([OTHER_CLIENT]);
  });

  it('rejects a 403 with the API error', async () => {
    mockFetch(errorResponse(403, 'FORBIDDEN', 'Insufficient permissions'));

    const error = await fetchClients().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});

describe('fetchClients — the one retry', () => {
  it('is sent again after OFFLINE', async () => {
    const { calls } = mockFetch(new TypeError('Failed to fetch'), jsonResponse(200, { items: CLIENTS }));

    await expect(fetchClients()).resolves.toEqual(CLIENTS);
    expect(calls).toHaveLength(2);
    expect(waitBeforeRetry).toHaveBeenCalledTimes(1);
  });
});
