import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiErrorInit, NetworkError } from '@/lib/api/client';
import { applyApiError, FORM_ERROR_KEY, formErrorMessage, SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/form-errors';

const apiError = (init: ApiErrorInit) => new ApiError(init);
const server = (message: string) => ({ type: 'server', message });

const rateLimited = (retryAfterSeconds?: number) =>
  apiError({
    status: 429,
    code: 'RATE_LIMITED',
    message: 'Too many requests, please try again later',
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

describe('formErrorMessage', () => {
  it.each<[string, unknown, string]>([
    [
      'an API message written for people',
      apiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }),
      'Invalid email or password',
    ],
    ['a rate limit with Retry-After', rateLimited(37), 'Too many attempts. Try again in 37 seconds.'],
    ['a rate limit of one second', rateLimited(1), 'Too many attempts. Try again in 1 second.'],
    ['a rate limit without Retry-After', rateLimited(), 'Too many attempts. Please try again later.'],
    [
      'an internal error',
      apiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' }),
      'Service is unavailable. Please try again.',
    ],
    [
      'a 2xx body that broke the contract',
      apiError({ status: 200, code: 'INTERNAL_ERROR', message: 'Unexpected response from the server' }),
      SERVICE_UNAVAILABLE_MESSAGE,
    ],
    [
      'any 5xx status',
      apiError({ status: 503, code: 'BAD_REQUEST', message: 'upstream' }),
      SERVICE_UNAVAILABLE_MESSAGE,
    ],
    [
      'an email conflict',
      apiError({ status: 409, code: 'EMAIL_TAKEN', message: 'Email is already registered' }),
      'Email is already registered',
    ],
    [
      'a forbidden request',
      apiError({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' }),
      'Insufficient permissions',
    ],
    ['a network failure', new NetworkError(new TypeError('Failed to fetch')), SERVICE_UNAVAILABLE_MESSAGE],
  ])('maps %s', (_, error, expected) => {
    expect(formErrorMessage(error)).toBe(expected);
  });

  it.each<[string, unknown]>([
    ['a raw Error', new Error('db password is hunter2')],
    ['a string', 'text'],
    ['undefined', undefined],
    ['null', null],
  ])('never exposes %s', (_, error) => {
    const message = formErrorMessage(error);
    expect(message).toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(message).not.toContain('hunter2');
  });
});

describe('applyApiError', () => {
  const FIELDS = ['email', 'password', 'name'] as const;
  type Fields = { email: string; password: string; name: string };

  const validation = (details: ApiErrorInit['details']) =>
    apiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      ...(details === undefined ? {} : { details }),
    });

  function apply(error: unknown, fields: readonly (keyof Fields)[] = FIELDS) {
    const setError = vi.fn();
    applyApiError<Fields>(error, setError, fields);
    return setError.mock.calls;
  }

  it('sets each field the form has', () => {
    expect(
      apply(
        validation([
          { path: 'email', message: 'Enter a valid email address' },
          { path: 'password', message: 'Password must be at least 8 characters' },
        ]),
      ),
    ).toEqual([
      ['email', server('Enter a valid email address')],
      ['password', server('Password must be at least 8 characters')],
    ]);
  });

  it('keeps the first message per field', () => {
    expect(
      apply(
        validation([
          { path: 'email', message: 'first' },
          { path: 'email', message: 'second' },
        ]),
      ),
    ).toEqual([['email', server('first')]]);
  });

  it('turns a path the form does not have into the form-level error', () => {
    expect(apply(validation([{ path: 'role', message: 'Invalid option' }]))).toEqual([
      ['root.server', server('Request validation failed')],
    ]);
  });

  it('sets the known field and the form-level error when an entry is left over', () => {
    expect(
      apply(
        validation([
          { path: 'email', message: 'x' },
          { path: 'clientId', message: 'Client not found' },
        ]),
      ),
    ).toEqual([
      ['email', server('x')],
      ['root.server', server('Request validation failed')],
    ]);
  });

  it('turns an empty path into the form-level error', () => {
    expect(apply(validation([{ path: '', message: 'Invalid input' }]))).toEqual([
      ['root.server', server('Request validation failed')],
    ]);
  });

  it.each<[string, ApiErrorInit['details']]>([
    ['no details', undefined],
    ['empty details', []],
  ])('sets the form-level error on a validation error with %s', (_, details) => {
    expect(apply(validation(details))).toEqual([['root.server', server('Request validation failed')]]);
  });

  const taken = apiError({ status: 409, code: 'EMAIL_TAKEN', message: 'Email is already registered' });

  it('puts EMAIL_TAKEN under the email field', () => {
    expect(apply(taken)).toEqual([['email', server('Email is already registered')]]);
  });

  it('puts EMAIL_TAKEN on the form when the form has no email field', () => {
    expect(apply(taken, ['password'])).toEqual([['root.server', server('Email is already registered')]]);
  });

  it('puts invalid credentials on the form', () => {
    expect(apply(apiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }))).toEqual(
      [['root.server', server('Invalid email or password')]],
    );
  });

  it('puts a rate limit on the form with the readable message', () => {
    expect(apply(rateLimited(37))).toEqual([['root.server', server('Too many attempts. Try again in 37 seconds.')]]);
  });

  it.each<[string, unknown]>([
    ['a network failure', new NetworkError(new TypeError('Failed to fetch'))],
    ['an internal error', apiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' })],
    ['a raw Error', new Error('boom')],
  ])('puts the service-unavailable message on the form for %s', (_, error) => {
    expect(apply(error)).toEqual([['root.server', server('Service is unavailable. Please try again.')]]);
  });

  it('keeps form-level errors under root.server', () => {
    expect(FORM_ERROR_KEY).toBe('root.server');
  });
});
