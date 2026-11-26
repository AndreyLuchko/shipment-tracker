import { authResponseSchema } from '@shipment-tracker/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  apiRequest,
  isServiceUnavailable,
  NetworkError,
  readCookie,
  setSessionExpiredHandler,
} from '@/lib/api/client';
import { waitBeforeRetry } from '@/lib/api/retry-delay';

import { emptyResponse, errorResponse, jsonResponse, mockFetch, setCookie, textResponse } from '../../helpers/fetch';
import { USER } from '../../helpers/fixtures';

const OK = (user: unknown) => jsonResponse(200, { user });
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const BAD_CSRF = () => errorResponse(403, 'CSRF_TOKEN_INVALID', 'CSRF token missing or invalid');
const INVALID = () => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const LIMITED = () =>
  errorResponse(429, 'RATE_LIMITED', 'Too many requests, please try again later', { headers: { 'retry-after': '37' } });
const DOWN = () => textResponse(500, 'Internal Server Error');
const BAD_GATEWAY = () => textResponse(502, 'Bad Gateway');
const GATEWAY_TIMEOUT = () => textResponse(504, 'Gateway Timeout');
const LOADING_PAGE = () => textResponse(200, '<!doctype html><title>Waking up</title>');
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

/** The error `apiRequest` rejects with when the one reply is `reply`. */
async function errorFor(reply: Response): Promise<unknown> {
  mockFetch(reply);
  return rejection(call());
}

describe('isServiceUnavailable', () => {
  it('is true for a NetworkError', () => {
    expect(isServiceUnavailable(new NetworkError(new TypeError('Failed to fetch')))).toBe(true);
  });

  it.each([
    ['502', BAD_GATEWAY],
    ['503', () => textResponse(503, '')],
    ['504', GATEWAY_TIMEOUT],
  ])('is true for a %s', async (_name, reply) => {
    expect(isServiceUnavailable(await errorFor(reply()))).toBe(true);
  });

  it('is true for an unexpected 2xx body (a loading page)', async () => {
    const error = await errorFor(LOADING_PAGE());

    expect(error).toMatchObject({ status: 200, unexpected: true });
    expect(isServiceUnavailable(error)).toBe(true);
  });

  it.each([
    ['a non-JSON 500', DOWN],
    ['the API own 500', () => errorResponse(500, 'INTERNAL_ERROR', 'Internal server error')],
    ['a 401', UNAUTH],
    ['a 429', LIMITED],
    ['a 422 envelope', () => errorResponse(422, 'VALIDATION_ERROR', 'Invalid input')],
  ])('is false for %s', async (_name, reply) => {
    expect(isServiceUnavailable(await errorFor(reply()))).toBe(false);
  });

  it.each([
    ['an Error', new Error('x')],
    ['a string', 'x'],
    ['undefined', undefined],
  ])('is false for %s', (_name, value) => {
    expect(isServiceUnavailable(value)).toBe(false);
  });
});

describe('apiRequest — retryWhenUnavailable', () => {
  const retrying = () => apiRequest('/auth/me', { schema: authResponseSchema, retryWhenUnavailable: true });
  const delay = vi.mocked(waitBeforeRetry);

  it.each([
    ['the network is offline', OFFLINE],
    ['a 502', BAD_GATEWAY],
    ['a loading page', LOADING_PAGE],
  ])('sends the request again after %s', async (_name, first) => {
    const { calls } = mockFetch(first(), OK(USER));

    await expect(retrying()).resolves.toEqual({ user: USER });
    expect(calls).toHaveLength(2);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it('retries once only', async () => {
    const { calls } = mockFetch(GATEWAY_TIMEOUT(), GATEWAY_TIMEOUT());

    const error = await apiErrorOf(retrying());

    expect(error.status).toBe(504);
    expect(calls).toHaveLength(2);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it('does not retry the API own 500', async () => {
    const { calls } = mockFetch(DOWN());

    await apiErrorOf(retrying());

    expect(calls).toHaveLength(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('does not retry a 401 and fires the session-expired handler once', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    const { calls } = mockFetch(UNAUTH());

    const error = await apiErrorOf(retrying());

    expect(error.code).toBe('UNAUTHORIZED');
    expect(calls).toHaveLength(1);
    expect(delay).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('repeats the method, URL and body, and reads the CSRF cookie again', async () => {
    setCookie('csrf_token', 'tok_-1');
    // The cookie changes while the retry waits (e.g. the API sets a fresh one as it wakes up).
    delay.mockImplementationOnce(() => {
      setCookie('csrf_token', 'tok_-2');
      return Promise.resolve();
    });
    const { calls } = mockFetch(OFFLINE(), OK(USER));

    await apiRequest('/auth/login', {
      method: 'POST',
      body: { a: 1 },
      schema: authResponseSchema,
      retryWhenUnavailable: true,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.url).toBe('/api/v1/auth/login');
    expect(calls[1]?.url).toBe(calls[0]?.url);
    expect(calls[0]?.body).toBe('{"a":1}');
    expect(calls[1]?.body).toBe('{"a":1}');
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
    expect(calls[1]?.headers.get('x-csrf-token')).toBe('tok_-2');
  });

  it('does not retry without the option', async () => {
    const { calls } = mockFetch(OFFLINE());

    expect(await rejection(call())).toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(1);
    expect(delay).not.toHaveBeenCalled();
  });
});
