import type { ErrorDetail } from '@shipment-tracker/shared';
import { vi } from 'vitest';

export interface FetchCall {
  url: string;
  method: string;
  headers: Headers;
  /** The body as sent, or `undefined` when there was none. */
  body: string | undefined;
  credentials: RequestCredentials | undefined;
}

export type FetchReply = Response | Error | Promise<Response>;

/** Stubs the global `fetch`; the n-th call gets the n-th reply, an extra call throws. `calls` is live. */
export function mockFetch(...replies: FetchReply[]): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const stub = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
      credentials: init?.credentials,
    };
    calls.push(call);
    const reply = replies[calls.length - 1];
    if (reply === undefined) {
      return Promise.reject(new Error(`Unexpected fetch call #${calls.length}: ${call.method} ${call.url}`));
    }
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(reply);
  });
  vi.stubGlobal('fetch', stub);
  return { calls };
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

export function textResponse(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  options: { details?: ErrorDetail[]; headers?: Record<string, string> } = {},
): Response {
  const error = options.details === undefined ? { code, message } : { code, message, details: options.details };
  return jsonResponse(status, { error }, options.headers);
}

export function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/`;
}

export function clearCookies(): void {
  // Test files that run in the `node` environment have no `document`, and so no cookies.
  if (typeof document === 'undefined') return;
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
