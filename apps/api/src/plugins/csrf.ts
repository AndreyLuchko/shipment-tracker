import { timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@shipment-tracker/shared';
import { AppError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Requires `X-CSRF-Token` header = `csrf_token` cookie = `csrf` claim of the session JWT on unsafe methods,
     * otherwise 403 CSRF_TOKEN_INVALID. Called by `authenticate` after the JWT has been verified.
     */
    verifyCsrf: (request: FastifyRequest) => void;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Constant-time comparison; strings of different byte length are a mismatch, never a throw. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Session-bound double-submit CSRF check, exposed as `app.verifyCsrf`. */
export const csrfPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('verifyCsrf', (request: FastifyRequest) => {
    if (SAFE_METHODS.has(request.method)) {
      return;
    }

    const header = request.headers[CSRF_HEADER_NAME];
    const cookie = request.cookies[CSRF_COOKIE_NAME];
    const claim = request.user.csrf;

    if (
      !isNonEmptyString(header) ||
      !isNonEmptyString(cookie) ||
      !isNonEmptyString(claim) ||
      !safeEqual(header, claim) ||
      !safeEqual(cookie, claim)
    ) {
      throw new AppError(403, 'CSRF_TOKEN_INVALID', 'CSRF token missing or invalid');
    }
  });
});
