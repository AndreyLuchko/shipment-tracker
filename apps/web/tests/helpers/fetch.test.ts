import { describe, expect, it } from 'vitest';

import { deferred, emptyResponse, errorResponse, jsonResponse, mockFetch, setCookie } from './fetch';

describe('mockFetch', () => {
  it('answers with the queued response and records the call', async () => {
    const { calls } = mockFetch(jsonResponse(201, { a: 1 }));

    const response = await fetch('/x', {
      method: 'POST',
      body: '{"b":2}',
      headers: { 'X-Test': '1' },
      credentials: 'include',
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ a: 1 });
    expect(calls).toEqual([
      { url: '/x', method: 'POST', headers: expect.any(Headers), body: '{"b":2}', credentials: 'include' },
    ]);
    expect(calls[0]?.headers.get('x-test')).toBe('1');
  });

  it('rejects with a queued error', async () => {
    const error = new TypeError('Failed to fetch');
    const { calls } = mockFetch(error);

    await expect(fetch('/x')).rejects.toBe(error);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.body).toBeUndefined();
  });

  it('rejects a call beyond the queued replies', async () => {
    mockFetch(jsonResponse(200, {}));

    await fetch('/x');

    await expect(fetch('/y')).rejects.toThrow(/Unexpected fetch call #2: GET \/y/);
  });

  it('keeps the call pending until a deferred reply resolves', async () => {
    const reply = deferred<Response>();
    mockFetch(reply.promise);

    let settled = false;
    const pending = fetch('/x').then((response) => {
      settled = true;
      return response;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    reply.resolve(emptyResponse());

    expect((await pending).status).toBe(204);
  });
});

describe('reply builders', () => {
  it('builds empty responses', async () => {
    const noContent = emptyResponse();
    const reset = emptyResponse(205);

    expect(noContent.status).toBe(204);
    expect(reset.status).toBe(205);
    expect(await noContent.text()).toBe('');
    expect(await reset.text()).toBe('');
  });

  it('builds the error envelope with details and headers', async () => {
    const response = errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', {
      details: [{ path: 'email', message: 'x' }],
      headers: { 'retry-after': '5' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ path: 'email', message: 'x' }],
      },
    });
    expect(response.headers.get('retry-after')).toBe('5');
  });

  it('builds the error envelope without a details key', async () => {
    const body: unknown = await errorResponse(404, 'NOT_FOUND', 'Route not found').json();

    expect(body).toStrictEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
});

describe('cookies', () => {
  it('sets a cookie', () => {
    setCookie('csrf_token', 'tok_-1');

    expect(document.cookie).toBe('csrf_token=tok_-1');
  });

  it('starts the next test without it', () => {
    expect(document.cookie).toBe('');
  });
});
