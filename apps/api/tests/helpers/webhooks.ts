import { createHmac } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { CARRIER_SIGNATURE_HEADER_NAME } from '@shipment-tracker/shared';

export const WEBHOOK_URL = '/api/v1/webhooks/carrier';

/**
 * Test oracle for the `X-Carrier-Signature` value: computed straight from `node:crypto`, deliberately
 * independent of `src/lib/hmac.ts`, so a bug there cannot hide behind the same bug here.
 */
export function signBody(body: string | Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export interface PostWebhookOptions {
  /** Sign with this secret instead of `app.config.webhookSecret`. */
  secret?: string;
  /** Send exactly this header value instead of the computed signature; `null` sends no signature header. */
  signature?: string | string[] | null;
  /** Defaults to 'application/json'; `null` sends no content-type header. */
  contentType?: string | null;
}

/**
 * POSTs to the carrier webhook. A string `body` is sent as is, `undefined` sends no body, anything else is
 * `JSON.stringify`-ed first. The computed signature covers exactly the bytes sent.
 */
export function postWebhook(
  app: FastifyInstance,
  body: unknown,
  options: PostWebhookOptions = {},
): Promise<LightMyRequestResponse> {
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);

  const headers: Record<string, string | string[]> = {};
  const contentType = options.contentType === undefined ? 'application/json' : options.contentType;
  if (contentType !== null) {
    headers['content-type'] = contentType;
  }
  const signature =
    options.signature === undefined
      ? signBody(payload ?? '', options.secret ?? app.config.webhookSecret)
      : options.signature;
  if (signature !== null) {
    headers[CARRIER_SIGNATURE_HEADER_NAME] = signature;
  }

  return app.inject({ method: 'POST', url: WEBHOOK_URL, headers, ...(payload !== undefined ? { payload } : {}) });
}
