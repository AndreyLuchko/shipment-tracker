import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from '../../src/lib/hmac.js';
import { signBody } from '../helpers/webhooks.js';

const SECRET = 'k'.repeat(32);
const OTHER_SECRET = 'j'.repeat(32);
const BODY = '{"trackingNumber":"ST-2026-000123","status":"IN_TRANSIT"}';
const SIGNATURE_FORMAT = /^sha256=[0-9a-f]{64}$/;

const good = signPayload(BODY, SECRET);
const hex = good.slice('sha256='.length);

function verify(payload: string | Buffer, signature: unknown, secret = SECRET): boolean {
  let result: boolean | undefined;
  expect(() => {
    result = verifySignature(payload, signature, secret);
  }).not.toThrow();
  return result as boolean;
}

describe('signPayload', () => {
  it('matches the RFC 4231 HMAC-SHA256 test vector (test case 2)', () => {
    expect(signPayload('what do ya want for nothing?', 'Jefe')).toBe(
      'sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('produces sha256=<64 lowercase hex> equal to the oracle', () => {
    const signature = signPayload(BODY, SECRET);

    expect(signature).toMatch(SIGNATURE_FORMAT);
    expect(signature).toBe(signBody(BODY, SECRET));
  });

  it('signs a Buffer and the equivalent string identically', () => {
    expect(signPayload(Buffer.from(BODY), SECRET)).toBe(signPayload(BODY, SECRET));
  });

  it('hashes a string as UTF-8', () => {
    expect(signPayload('Київ', SECRET)).toBe(signPayload(Buffer.from('Київ', 'utf8'), SECRET));
  });

  it('depends on the secret', () => {
    expect(signPayload(BODY, SECRET)).not.toBe(signPayload(BODY, OTHER_SECRET));
  });

  it('signs an empty payload', () => {
    expect(signPayload('', SECRET)).toMatch(SIGNATURE_FORMAT);
  });
});

describe('verifySignature', () => {
  it('accepts the signature of the string payload', () => {
    expect(verify(BODY, good)).toBe(true);
  });

  it('accepts the signature for the same bytes given as a Buffer', () => {
    expect(verify(Buffer.from(BODY), good)).toBe(true);
  });

  it('accepts upper-case hex digits (C2)', () => {
    expect(verify(BODY, `sha256=${hex.toUpperCase()}`)).toBe(true);
  });

  it('accepts the signature of an empty payload', () => {
    expect(verify('', signPayload('', SECRET))).toBe(true);
  });

  it('accepts the oracle signature', () => {
    expect(verify(BODY, signBody(BODY, SECRET))).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a number', 42],
    ['an array with the good signature', [good]],
    ['a repeated header', [good, good]],
    ['an object', {}],
  ])('rejects %s as the signature', (_label, signature) => {
    expect(verify(BODY, signature)).toBe(false);
  });

  it.each([
    ['the hex without the prefix', hex],
    ['an upper-case prefix', `SHA256=${hex}`],
    ['a sha1 prefix', `sha1=${hex}`],
    ['63 hex digits', `sha256=${hex.slice(1)}`],
    ['65 hex digits', `sha256=${hex}0`],
    ['non-hex digits', `sha256=${'z'.repeat(64)}`],
    ['a trailing space', `${good} `],
    ['a leading space', ` ${good}`],
    ['two comma-joined signatures', `${good}, ${good}`],
  ])('rejects a malformed signature: %s', (_label, signature) => {
    expect(verify(BODY, signature)).toBe(false);
  });

  it('rejects the signature for a different body', () => {
    expect(verify(BODY.replace('IN_TRANSIT', 'DELIVERED'), good)).toBe(false);
  });

  it('rejects the same JSON serialized with different bytes', () => {
    expect(verify(JSON.stringify(JSON.parse(BODY), null, 2), good)).toBe(false);
  });

  it('rejects the body with a trailing space', () => {
    expect(verify(`${BODY} `, good)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    expect(verify(BODY, signPayload(BODY, OTHER_SECRET))).toBe(false);
  });

  it('rejects an all-zero digest', () => {
    expect(verify(BODY, `sha256=${'0'.repeat(64)}`)).toBe(false);
  });

  it('rejects a good signature verified with another secret', () => {
    expect(verify(BODY, good, OTHER_SECRET)).toBe(false);
  });
});
