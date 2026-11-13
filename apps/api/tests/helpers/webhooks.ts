import { createHmac } from 'node:crypto';

/**
 * Test oracle for the `X-Carrier-Signature` value: computed straight from `node:crypto`, deliberately
 * independent of `src/lib/hmac.ts`, so a bug there cannot hide behind the same bug here.
 */
export function signBody(body: string | Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}
