import { authResponseSchema } from '@shipment-tracker/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest, NetworkError, readCookie, setSessionExpiredHandler } from '@/lib/api/client';

import { emptyResponse, errorResponse, jsonResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { USER } from '../../helpers/fixtures';

const OK = (user: unknown) => jsonResponse(200, { user });
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const BAD_CSRF = () => errorResponse(403, 'CSRF_TOKEN_INVALID', 'CSRF token missing or invalid');
const INVALID = () => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const LIMITED = () =>
  errorResponse(429, 'RATE_LIMITED', 'Too many requests, please try again later', { headers: { 'retry-after': '37' } });
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');

const UNEXPECTED = 'Unexpected response from the server';

const call = () => apiRequest('/auth/me', { schema: authResponseSchema });

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

async function apiErrorOf(promise: Promise<unknown>): Promise<ApiError> {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

afterEach(() => setSessionExpiredHandler(null));

describe('apiRequest — the request', () => {
  it('sends a GET to the proxied path with credentials and no body', async () => {
    const { calls } = mockFetch(OK(USER));

    await expect(call()).resolves.toEqual({ user: USER });

    const sent = calls[0];
    expect(sent?.url).toBe('/api/v1/auth/me');
    expect(sent?.method).toBe('GET');
    expect(sent?.credentials).toBe('include');
    expect(sent?.body).toBeUndefined();
    expect(sent?.headers.get('accept')).toBe('application/json');
    expect(sent?.headers.has('content-type')).toBe(false);
    expect(sent?.headers.has('x-csrf-token')).toBe(false);
  });

  it('sends no CSRF header on a GET even with the cookie', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(OK(USER));

    await call();

    expect(calls[0]?.headers.has('x-csrf-token')).toBe(false);
  });

  it('sends a JSON body', async () => {
    const { calls } = mockFetch(OK(USER));

    await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: 'a@b.co', password: 'x' },
      schema: authResponseSchema,
    });

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
    expect(calls[0]?.body).toBe('{"email":"a@b.co","password":"x"}');
    expect(calls[0]?.credentials).toBe('include');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('echoes the CSRF cookie on %s', async (method) => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(emptyResponse());

    await apiRequest('/x', { method });

    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
  });

  it('sends no CSRF header on a POST without the cookie', async () => {
    const { calls } = mockFetch(emptyResponse());

    await apiRequest('/x', { method: 'POST' });

    expect(calls[0]?.headers.has('x-csrf-token')).toBe(false);
  });

  it('sends a bodyless POST without content-type', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(emptyResponse());

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();

    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.has('content-type')).toBe(false);
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
  });

  it('finds the CSRF cookie among others', async () => {
    setCookie('a', '1');
    setCookie('csrf_token', 'tok_-1');
    setCookie('b', '2');
    const { calls } = mockFetch(emptyResponse());

    await apiRequest('/x', { method: 'POST' });

    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
  });

  it('matches the CSRF cookie name exactly', async () => {
    setCookie('xcsrf_token', 'evil');
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(emptyResponse());

    await apiRequest('/x', { method: 'POST' });

    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
  });

  it('ignores a cookie whose name only ends with the CSRF name', async () => {
    setCookie('xcsrf_token', 'evil');
    const { calls } = mockFetch(emptyResponse());

    await apiRequest('/x', { method: 'POST' });

    expect(calls[0]?.headers.has('x-csrf-token')).toBe(false);
  });
});

describe('apiRequest — a 2xx answer', () => {
  it('parses the body with the schema and drops extras', async () => {
    mockFetch(jsonResponse(200, { user: { ...USER, passwordHash: 'x' }, extra: 1 }));

    await expect(call()).resolves.toEqual({ user: USER });
  });

  it('rejects a body that does not match the schema', async () => {
    mockFetch(jsonResponse(200, { user: { id: 1 } }));

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 200, code: 'INTERNAL_ERROR', message: UNEXPECTED });
  });

  it('rejects a body that is not JSON', async () => {
    mockFetch(textResponse(200, '<html></html>'));

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 200, code: 'INTERNAL_ERROR', message: UNEXPECTED });
  });

  it('rejects an empty body when a schema is given', async () => {
    mockFetch(emptyResponse());

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 204, code: 'INTERNAL_ERROR', message: UNEXPECTED });
  });
});

describe('apiRequest — another answer', () => {
  it('maps the error envelope', async () => {
    mockFetch(INVALID());

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    expect(error.details).toBeUndefined();
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('keeps the validation details', async () => {
    const details = [{ path: 'email', message: 'Enter a valid email address' }];
    mockFetch(errorResponse(400, 'VALIDATION_ERROR', 'Request validation failed', { details }));

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(error.details).toEqual(details);
  });

  it('reads Retry-After on a 429', async () => {
    mockFetch(LIMITED());

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(error.retryAfterSeconds).toBe(37);
  });

  it.each([undefined, '0', '-5', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT'])(
    'ignores Retry-After %s on a 429',
    async (retryAfter) => {
      const headers: Record<string, string> = retryAfter === undefined ? {} : { 'retry-after': retryAfter };
      mockFetch(errorResponse(429, 'RATE_LIMITED', 'Too many requests, please try again later', { headers }));

      const error = await apiErrorOf(call());

      expect(error.retryAfterSeconds).toBeUndefined();
    },
  );

  it('ignores Retry-After outside a 429', async () => {
    mockFetch(errorResponse(401, 'UNAUTHORIZED', 'Authentication required', { headers: { 'retry-after': '37' } }));

    const error = await apiErrorOf(call());

    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('maps a plain-text 500', async () => {
    mockFetch(DOWN());

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: UNEXPECTED });
  });

  it('maps JSON that is not the envelope', async () => {
    mockFetch(jsonResponse(502, { message: 'bad gateway' }));

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 502, code: 'INTERNAL_ERROR', message: UNEXPECTED });
  });

  it('maps a code outside the contract', async () => {
    mockFetch(errorResponse(404, 'NOPE', 'x'));

    const error = await apiErrorOf(call());

    expect(error).toMatchObject({ status: 404, code: 'INTERNAL_ERROR', message: UNEXPECTED });
  });

  it('throws a NetworkError when fetch rejects', async () => {
    const cause = OFFLINE();
    mockFetch(cause);

    const error = await rejection(call());

    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as NetworkError).message).toBe('Network request failed');
    expect((error as NetworkError).cause).toBe(cause);
    expect((error as NetworkError).name).toBe('NetworkError');
  });

  it('names ApiError and makes it an Error', async () => {
    mockFetch(INVALID());

    const error = await apiErrorOf(call());

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
  });
});

describe('apiRequest — the session-expired handler', () => {
  it('fires on UNAUTHORIZED and still rejects', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    mockFetch(UNAUTH());

    const error = await apiErrorOf(call());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('fires on CSRF_TOKEN_INVALID', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    mockFetch(BAD_CSRF());

    await rejection(call());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['INVALID', INVALID],
    ['FORBIDDEN', () => errorResponse(403, 'FORBIDDEN', 'Insufficient permissions')],
    ['LIMITED', LIMITED],
    ['DOWN', DOWN],
    ['OFFLINE', OFFLINE],
  ])('does not fire on %s', async (_name, reply) => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    mockFetch(reply());

    await rejection(call());

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire for a session probe', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    mockFetch(UNAUTH());

    const error = await apiErrorOf(apiRequest('/auth/me', { schema: authResponseSchema, sessionProbe: true }));

    expect(handler).not.toHaveBeenCalled();
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('rejects normally when the handler was removed', async () => {
    setSessionExpiredHandler(vi.fn());
    setSessionExpiredHandler(null);
    mockFetch(UNAUTH());

    const error = await apiErrorOf(call());

    expect(error.code).toBe('UNAUTHORIZED');
  });
});

describe('readCookie', () => {
  it('returns undefined without cookies', () => {
    expect(readCookie('csrf_token')).toBeUndefined();
  });

  it('returns the value', () => {
    setCookie('csrf_token', 'abc_-123');

    expect(readCookie('csrf_token')).toBe('abc_-123');
  });

  it('decodes the value', () => {
    setCookie('note', 'a%20b');

    expect(readCookie('note')).toBe('a b');
  });

  it('returns a value that cannot be decoded as is', () => {
    setCookie('bad', '%E0%A4%A');

    expect(readCookie('bad')).toBe('%E0%A4%A');
  });

  it('does not match a prefix of the name', () => {
    setCookie('csrf_token', 'x');

    expect(readCookie('csrf')).toBeUndefined();
  });
});
