import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  type ErrorCode,
  type ErrorDetail,
  errorResponseSchema,
} from '@shipment-tracker/shared';
import type { ZodType } from 'zod';

import { waitBeforeRetry } from '@/lib/api/retry-delay';

export const API_BASE_PATH = '/api/v1';
export const UNEXPECTED_RESPONSE_MESSAGE = 'Unexpected response from the server';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiErrorInit {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
  retryAfterSeconds?: number;
  unexpected?: boolean;
}

/** The API answered, but not with the success the caller asked for. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** Present only on `VALIDATION_ERROR`. */
  readonly details?: ErrorDetail[];
  /** Whole seconds from the `Retry-After` header; present only on a 429 that carries one. */
  readonly retryAfterSeconds?: number;
  /** `true` when the body was not the expected JSON (an HTML page, an empty body, the wrong shape). */
  readonly unexpected: boolean;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.unexpected = init.unexpected ?? false;
    if (init.details !== undefined) this.details = init.details;
    if (init.retryAfterSeconds !== undefined) this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/** The request produced no HTTP response at all (offline, DNS, connection reset). */
export class NetworkError extends Error {
  /** `message` is 'Network request failed'; the original failure is kept as `cause`. */
  constructor(cause: unknown) {
    super('Network request failed', { cause });
    this.name = 'NetworkError';
  }
}

export interface ApiRequestOptions<T> {
  /** Defaults to 'GET'. */
  method?: HttpMethod;
  /** Sent as JSON when defined. */
  body?: unknown;
  /** Parses the 2xx body. Without it the body is not read and the promise resolves to `undefined`. */
  schema?: ZodType<T>;
  /** `true` for the request that asks whether a session exists: its 401 does not fire the session-expired handler. */
  sessionProbe?: boolean;
  /** Safe requests only: when the first attempt is `isServiceUnavailable`, wait `waitBeforeRetry()` and send it once more. */
  retryWhenUnavailable?: boolean;
}

/** NetworkError; ApiError 502 / 503 / 504; or an `unexpected` ApiError with a 2xx status (e.g. an HTML loading page). */
export function isServiceUnavailable(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (!(error instanceof ApiError)) return false;
  if (error.status === 502 || error.status === 503 || error.status === 504) return true;
  return error.unexpected && error.status >= 200 && error.status < 300;
}

let sessionExpiredHandler: (() => void) | null = null;

/** Called when any request (except a session probe) is answered `UNAUTHORIZED` or `CSRF_TOKEN_INVALID`. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** The value of a cookie readable by JS, or `undefined` (also on the server, where there is no `document`). */
export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const pair = part.trim();
    const separator = pair.indexOf('=');
    if (separator === -1 || pair.slice(0, separator) !== name) continue;
    const value = pair.slice(separator + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/** `path` starts with '/' and is relative to `API_BASE_PATH`, e.g. '/auth/me'. */
export async function apiRequest<T = void>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
  if (options.retryWhenUnavailable !== true) return sendOnce(path, options);
  try {
    return await sendOnce(path, options);
  } catch (error) {
    if (!isServiceUnavailable(error)) throw error;
  }
  await waitBeforeRetry();
  return sendOnce(path, options);
}

/** One attempt. An unavailable answer never carries an auth code, so the session-expired handler sees only final answers. */
async function sendOnce<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ accept: 'application/json' });
  const init: RequestInit = { method, credentials: 'include', headers };

  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.body);
  }
  if (method !== 'GET') {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken !== undefined) headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(API_BASE_PATH + path, init);
  } catch (reason) {
    throw new NetworkError(reason);
  }

  if (response.ok) {
    // Without a schema the caller expects no body (`T` is `void`).
    if (options.schema === undefined) return undefined as T;
    const parsed = options.schema.safeParse(await readJson(response));
    if (parsed.success) return parsed.data;
    throw unexpectedResponse(response.status);
  }

  const envelope = errorResponseSchema.safeParse(await readJson(response));
  const error = envelope.success
    ? new ApiError({
        status: response.status,
        code: envelope.data.error.code,
        message: envelope.data.error.message,
        details: envelope.data.error.details,
        retryAfterSeconds: retryAfterSeconds(response),
      })
    : unexpectedResponse(response.status);

  if ((error.code === 'UNAUTHORIZED' || error.code === 'CSRF_TOKEN_INVALID') && !options.sessionProbe) {
    sessionExpiredHandler?.();
  }
  throw error;
}

/** The parsed JSON body, or `undefined` when the body is empty or not JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function unexpectedResponse(status: number): ApiError {
  return new ApiError({ status, code: 'INTERNAL_ERROR', message: UNEXPECTED_RESPONSE_MESSAGE, unexpected: true });
}

function retryAfterSeconds(response: Response): number | undefined {
  if (response.status !== 429) return undefined;
  const header = response.headers.get('retry-after');
  if (header === null || !/^\d+$/.test(header)) return undefined;
  const seconds = Number(header);
  return seconds > 0 ? seconds : undefined;
}
