import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchCurrentUser, hasSessionHint, login, logout, register } from '@/lib/api/auth';
import { ApiError, setSessionExpiredHandler } from '@/lib/api/client';

import { emptyResponse, errorResponse, jsonResponse, mockFetch, setCookie } from '../../helpers/fetch';
import { DISPATCHER, USER } from '../../helpers/fixtures';

const OK = (user: unknown) => jsonResponse(200, { user });
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const INVALID = () => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

afterEach(() => setSessionExpiredHandler(null));

describe('login', () => {
  it('posts the credentials and resolves the signed-in user', async () => {
    const input = { email: 'client@demo.dev', password: 'client123' };
    const { calls } = mockFetch(OK(USER));

    await expect(login(input)).resolves.toEqual(USER);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/login');
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual(input);
  });

  it('rejects with the API error on bad credentials', async () => {
    mockFetch(INVALID());

    const error = await login({ email: 'client@demo.dev', password: 'wrong-pass' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_CREDENTIALS');
  });
});

describe('register', () => {
  it('posts the new account and resolves the new user', async () => {
    const input = { email: 'd@example.com', password: 'password123', name: 'Dana', role: 'DISPATCHER' as const };
    const { calls } = mockFetch(jsonResponse(201, { user: DISPATCHER }));

    await expect(register(input)).resolves.toEqual(DISPATCHER);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/register');
    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual(input);
  });
});

describe('logout', () => {
  it('posts without a body and with the CSRF header', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(emptyResponse());

    await expect(logout()).resolves.toBeUndefined();
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/logout');
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.has('content-type')).toBe(false);
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
  });
});

describe('fetchCurrentUser', () => {
  it('gets /auth/me and resolves the user', async () => {
    const { calls } = mockFetch(OK(USER));

    await expect(fetchCurrentUser()).resolves.toEqual(USER);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('/api/v1/auth/me');
  });

  it('is a session probe: a 401 rejects without firing the session-expired handler', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    mockFetch(UNAUTH());

    const error = await fetchCurrentUser().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNAUTHORIZED');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('hasSessionHint', () => {
  it('is false without cookies', () => {
    expect(hasSessionHint()).toBe(false);
  });

  it('is true with the CSRF cookie', () => {
    setCookie('csrf_token', 'tok_-1');
    expect(hasSessionHint()).toBe(true);
  });

  it('is false when only a cookie with a similar name is set', () => {
    setCookie('xcsrf_token', '1');
    expect(hasSessionHint()).toBe(false);
  });
});
