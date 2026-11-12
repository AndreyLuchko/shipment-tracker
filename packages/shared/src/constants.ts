/** Name of the HttpOnly cookie that carries the session JWT. */
export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';

/** Name of the readable cookie that carries the CSRF token (double-submit). */
export const CSRF_COOKIE_NAME = 'csrf_token';

/** Header the client echoes the CSRF token in. Lowercase: Fastify lowercases incoming header names. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Fixed page size of `GET /api/v1/shipments` (no `pageSize` parameter). */
export const SHIPMENTS_PAGE_SIZE = 20;

/** Highest `page` accepted by `GET /api/v1/shipments`; anything above is a `400`. */
export const SHIPMENTS_MAX_PAGE = 100_000;
