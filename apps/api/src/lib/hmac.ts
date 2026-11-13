import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_PREFIX = 'sha256=';

// Prefix only in lower case; hex digits in either case (M4 decision C2).
const SIGNATURE_PATTERN = /^sha256=([0-9a-fA-F]{64})$/;

function digest(payload: string | Buffer, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

/**
 * The `X-Carrier-Signature` value for `payload`: `sha256=` + the lowercase hex HMAC-SHA256 keyed with
 * `secret`. A string payload is hashed as UTF-8.
 */
export function signPayload(payload: string | Buffer, secret: string): string {
  return SIGNATURE_PREFIX + digest(payload, secret).toString('hex');
}

/**
 * `true` only when `signature` is a single `sha256=<64 hex digits>` string whose digest equals the HMAC of
 * `payload`. Never throws: the format is checked first because `timingSafeEqual` throws on buffers of
 * different length and `Buffer.from(text, 'hex')` silently drops invalid characters.
 */
export function verifySignature(payload: string | Buffer, signature: unknown, secret: string): boolean {
  if (typeof signature !== 'string') {
    return false;
  }

  const match = SIGNATURE_PATTERN.exec(signature);
  if (!match?.[1]) {
    return false;
  }

  return timingSafeEqual(Buffer.from(match[1], 'hex'), digest(payload, secret));
}
