import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  ERROR_CODES,
  errorResponseSchema,
} from '../../src/index.js';

describe('errorResponseSchema', () => {
  it('accepts a validation error with details', () => {
    const body = {
      error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ path: 'email', message: 'Invalid' }] },
    };
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
  });

  it('accepts an error without details', () => {
    expect(errorResponseSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success).toBe(true);
  });

  it('rejects an unknown code', () => {
    expect(errorResponseSchema.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(false);
  });

  it('rejects a body without the error envelope', () => {
    expect(errorResponseSchema.safeParse({ message: 'x' }).success).toBe(false);
  });
});

describe('ERROR_CODES', () => {
  it('lists the ten codes in order', () => {
    expect(ERROR_CODES).toEqual([
      'VALIDATION_ERROR',
      'BAD_REQUEST',
      'UNAUTHORIZED',
      'INVALID_CREDENTIALS',
      'FORBIDDEN',
      'CSRF_TOKEN_INVALID',
      'NOT_FOUND',
      'EMAIL_TAKEN',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ]);
  });
});

describe('cookie and header names', () => {
  it('match the session contract', () => {
    expect(ACCESS_TOKEN_COOKIE_NAME).toBe('access_token');
    expect(CSRF_COOKIE_NAME).toBe('csrf_token');
    expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
  });
});
