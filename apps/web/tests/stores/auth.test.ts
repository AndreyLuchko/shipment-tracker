import { describe, expect, it } from 'vitest';

import { ApiError, apiRequest } from '@/lib/api/client';
import { waitBeforeRetry } from '@/lib/api/retry-delay';
import { useAuthStore } from '@/stores/auth';

import {
  deferred,
  emptyResponse,
  errorResponse,
  jsonResponse,
  mockFetch,
  setCookie,
  textResponse,
} from '../helpers/fetch';
import { DISPATCHER, USER } from '../helpers/fixtures';

const OK = (user: unknown) => jsonResponse(200, { user });
const UNAUTH = () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required');
const BAD_CSRF = () => errorResponse(403, 'CSRF_TOKEN_INVALID', 'CSRF token missing or invalid');
const INVALID = () => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const TAKEN = () => errorResponse(409, 'EMAIL_TAKEN', 'Email is already registered');
const BAD_GATEWAY = () => textResponse(502, 'Bad Gateway');
const DOWN = () => textResponse(500, 'Internal Server Error');
const OFFLINE = () => new TypeError('Failed to fetch');

const CLIENT_LOGIN = { email: 'client@demo.dev', password: 'client123' };
const DISPATCHER_LOGIN = { email: 'dispatcher@demo.dev', password: 'dispatcher123' };
const NEW_DISPATCHER = { email: 'd@example.com', password: 'password123', name: 'Dana', role: 'DISPATCHER' as const };

const store = () => useAuthStore.getState();
const signIn = () => useAuthStore.setState({ status: 'authenticated', user: USER });

async function apiErrorOf(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error('Expected the promise to reject');
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('bootstrap', () => {
  it('starts idle with no user', () => {
    expect(store().status).toBe('idle');
    expect(store().user).toBeNull();
  });

  it('settles anonymous without a request when there is no session hint', async () => {
    const { calls } = mockFetch();

    await store().bootstrap();
    expect(store().status).toBe('anonymous');
    expect(calls).toHaveLength(0);
  });

  it('is loading while /auth/me is in flight, then authenticated', async () => {
    setCookie('csrf_token', 'tok_-1');
    const reply = deferred<Response>();
    const { calls } = mockFetch(reply.promise);

    const pending = store().bootstrap();
    expect(store().status).toBe('loading');

    reply.resolve(OK(USER));
    await pending;
    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(USER);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('/api/v1/auth/me');
  });

  it('settles anonymous on a 401', async () => {
    setCookie('csrf_token', 'tok_-1');
    mockFetch(UNAUTH());

    await expect(store().bootstrap()).resolves.toBeUndefined();
    expect(store().status).toBe('anonymous');
    expect(store().user).toBeNull();
  });

  it.each([
    ['the API is down', DOWN, 1],
    ['the network is offline', OFFLINE, 2],
    ['the body breaks the contract', () => jsonResponse(200, { nope: true }), 2],
  ])('resolves and settles anonymous when %s', async (_name, reply, expectedCalls) => {
    setCookie('csrf_token', 'tok_-1');
    // An unavailable reply is retried once, so it is answered twice; the API's own 500 is not retried.
    const { calls } = mockFetch(reply(), reply());

    await expect(store().bootstrap()).resolves.toBeUndefined();
    expect(store().status).toBe('anonymous');
    expect(calls).toHaveLength(expectedCalls);
  });

  it('sends one request for two concurrent calls', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(OK(USER));

    await Promise.all([store().bootstrap(), store().bootstrap()]);
    expect(calls).toHaveLength(1);
    expect(store().status).toBe('authenticated');
  });

  it('does nothing once authenticated', async () => {
    setCookie('csrf_token', 'tok_-1');
    mockFetch(OK(USER));
    await store().bootstrap();

    const { calls } = mockFetch();
    await expect(store().bootstrap()).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('does nothing once anonymous, even if a session hint appears later', async () => {
    mockFetch();
    await store().bootstrap();

    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch();
    await expect(store().bootstrap()).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(store().status).toBe('anonymous');
  });

  it.each([
    ['a late 401', UNAUTH],
    ['a late success for another user', () => OK(USER)],
  ])('ignores %s from the probe after a login', async (_name, lateReply) => {
    setCookie('csrf_token', 'tok_-1');
    const probe = deferred<Response>();
    mockFetch(probe.promise, OK(DISPATCHER));

    const pending = store().bootstrap();
    await store().login(DISPATCHER_LOGIN);
    probe.resolve(lateReply());
    await pending;

    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(DISPATCHER);
  });
});

describe('bootstrap — the one retry', () => {
  it('settles anonymous after two OFFLINE replies', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(OFFLINE(), OFFLINE());

    await store().bootstrap();
    expect(store().status).toBe('anonymous');
    expect(calls).toHaveLength(2);
    expect(waitBeforeRetry).toHaveBeenCalledTimes(1);
  });

  it('is authenticated after a 502 and then a 200', async () => {
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(BAD_GATEWAY(), OK(USER));

    await store().bootstrap();
    expect(store().status).toBe('authenticated');
    expect(calls).toHaveLength(2);
  });
});

describe('login and register', () => {
  it('login signs the user in after a 502 and then a 200', async () => {
    const { calls } = mockFetch(BAD_GATEWAY(), OK(USER));

    await store().login(CLIENT_LOGIN);
    expect(store().status).toBe('authenticated');
    expect(calls).toHaveLength(2);
  });

  it('login signs the user in', async () => {
    mockFetch(OK(USER));

    await store().login(CLIENT_LOGIN);
    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(USER);
  });

  it('a failed login rejects and leaves the state as it was', async () => {
    mockFetch(INVALID());

    const error = await apiErrorOf(store().login(CLIENT_LOGIN));
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(store().status).toBe('idle');
    expect(store().user).toBeNull();
  });

  it('a failed login while signed in keeps the current session', async () => {
    signIn();
    mockFetch(INVALID());

    await apiErrorOf(store().login(CLIENT_LOGIN));
    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(USER);
  });

  it('register signs the new user in', async () => {
    mockFetch(jsonResponse(201, { user: DISPATCHER }));

    await store().register(NEW_DISPATCHER);
    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(DISPATCHER);
  });

  it('a failed register rejects and leaves the state as it was', async () => {
    mockFetch(TAKEN());

    const error = await apiErrorOf(store().register(NEW_DISPATCHER));
    expect(error.code).toBe('EMAIL_TAKEN');
    expect(store().status).toBe('idle');
    expect(store().user).toBeNull();
  });
});

describe('logout, clear and session expiry', () => {
  it('logout posts with the CSRF header and forgets the session', async () => {
    signIn();
    setCookie('csrf_token', 'tok_-1');
    const { calls } = mockFetch(emptyResponse());

    await store().logout();
    expect(store().status).toBe('anonymous');
    expect(store().user).toBeNull();
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/auth/logout');
    expect(calls[0]?.headers.get('x-csrf-token')).toBe('tok_-1');
  });

  it.each([
    ['UNAUTHORIZED', UNAUTH],
    ['CSRF_TOKEN_INVALID', BAD_CSRF],
  ])('logout answered %s still resolves and forgets the session', async (_code, reply) => {
    signIn();
    mockFetch(reply());

    await expect(store().logout()).resolves.toBeUndefined();
    expect(store().status).toBe('anonymous');
  });

  it.each([
    ['the API is down', DOWN],
    ['the network is offline', OFFLINE],
  ])('logout rejects and keeps the session when %s', async (_name, reply) => {
    signIn();
    mockFetch(reply());

    await expect(store().logout()).rejects.toThrow();
    expect(store().status).toBe('authenticated');
    expect(store().user).toEqual(USER);
  });

  it('clear forgets the session', () => {
    signIn();

    store().clear();
    expect(store().status).toBe('anonymous');
    expect(store().user).toBeNull();
  });

  it('a 401 on any request clears the session (handler registered on module load)', async () => {
    signIn();
    mockFetch(UNAUTH());

    await apiRequest('/shipments').catch(() => undefined);
    expect(store().status).toBe('anonymous');
  });

  it('a 403 FORBIDDEN keeps the session', async () => {
    signIn();
    mockFetch(errorResponse(403, 'FORBIDDEN', 'Insufficient permissions'));

    await apiRequest('/shipments').catch(() => undefined);
    expect(store().status).toBe('authenticated');
  });
});

describe('no token in the store', () => {
  it('has exactly the seven keys of AuthState', () => {
    expect(Object.keys(store()).sort()).toEqual([
      'bootstrap',
      'clear',
      'login',
      'logout',
      'register',
      'status',
      'user',
    ]);
  });

  it('never holds the CSRF token', async () => {
    setCookie('csrf_token', 'secret-csrf-value');
    mockFetch(OK(USER));

    await store().login(CLIENT_LOGIN);
    expect(JSON.stringify(store())).not.toContain('secret-csrf-value');
  });
});
