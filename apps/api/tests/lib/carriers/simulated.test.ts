import type { IncomingHttpHeaders } from 'node:http';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { SIMULATED_CARRIER_NAME, SimulatedCarrierAdapter } from '../../../src/lib/carriers/simulated.js';
import type { CarrierAdapter, CarrierEvent } from '../../../src/lib/carriers/types.js';
import { AppError } from '../../../src/lib/errors.js';
import { signBody } from '../../helpers/webhooks.js';

const SECRET = 's'.repeat(32);
const adapter = new SimulatedCarrierAdapter(SECRET);

const payload = {
  trackingNumber: 'ST-2026-000123',
  status: 'IN_TRANSIT',
  location: ' Kyiv sorting hub ',
  note: 'Scanned',
  occurredAt: '2026-07-15T10:30:00Z',
};
const text = JSON.stringify(payload);

const expectedEvent: CarrierEvent = {
  trackingNumber: 'ST-2026-000123',
  status: 'IN_TRANSIT',
  location: 'Kyiv sorting hub',
  note: 'Scanned',
  occurredAt: new Date('2026-07-15T10:30:00.000Z'),
};

function call(body: string, signature: unknown = signBody(body, SECRET)): CarrierEvent {
  return adapter.parseWebhook(Buffer.from(body), { 'x-carrier-signature': signature } as IncomingHttpHeaders);
}

function callUnsigned(body: string): CarrierEvent {
  return adapter.parseWebhook(Buffer.from(body), {});
}

/** Runs `fn`, expects it to throw, and returns what it threw. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw');
}

const appErrors: AppError[] = [];

function expectAppError(fn: () => unknown, statusCode: number, code: string, message: string): void {
  const error = thrown(fn);
  expect(error).toBeInstanceOf(AppError);
  const appError = error as AppError;
  appErrors.push(appError);
  expect(appError.statusCode).toBe(statusCode);
  expect(appError.code).toBe(code);
  expect(appError.message).toBe(message);
  expect(appError.details).toBeUndefined();
}

function expectInvalidSig(fn: () => unknown): void {
  expectAppError(fn, 401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
}

function expectNotJson(fn: () => unknown): void {
  expectAppError(fn, 400, 'BAD_REQUEST', 'Request body is not valid JSON');
}

describe('SimulatedCarrierAdapter', () => {
  it('is named SIMULATED', () => {
    expect(adapter.name).toBe('SIMULATED');
    expect(adapter.name).toBe(SIMULATED_CARRIER_NAME);
  });

  it('does not implement fetchStatus', () => {
    const carrier: CarrierAdapter = adapter;
    expect(carrier.fetchStatus).toBeUndefined();
  });

  describe('parseWebhook — accepted', () => {
    it('normalizes a validly signed payload', () => {
      const event = call(text);
      expect(event).toEqual(expectedEvent);
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('leaves location and note undefined when absent', () => {
      const event = call(
        JSON.stringify({ trackingNumber: 'ST-2026-000123', status: 'IN_TRANSIT', occurredAt: payload.occurredAt }),
      );
      expect(event.location).toBeUndefined();
      expect(event.note).toBeUndefined();
    });

    it('accepts any formatting when it is signed as sent', () => {
      expect(call(JSON.stringify(payload, null, 2))).toEqual(expectedEvent);
    });
  });

  describe('parseWebhook — signature', () => {
    it('rejects a request without a signature', () => {
      expectInvalidSig(() => callUnsigned(text));
    });

    it('rejects a signature made with another secret', () => {
      expectInvalidSig(() => call(text, signBody(text, 'x'.repeat(32))));
    });

    it('rejects the signature of another body', () => {
      expectInvalidSig(() => call(text, signBody(text.replace('IN_TRANSIT', 'DELIVERED'), SECRET)));
    });

    it.each([
      ['malformed', 'sha256=nope'],
      ['repeated header', [signBody(text, SECRET), signBody(text, SECRET)]],
    ])('rejects a %s signature', (_label, signature) => {
      expectInvalidSig(() => call(text, signature));
    });
  });

  describe('parseWebhook — body', () => {
    it('rejects malformed JSON that is validly signed', () => {
      expectNotJson(() => call('{"trackingNumber":'));
    });

    it('rejects an empty body that is validly signed', () => {
      expectNotJson(() => call(''));
    });

    it('checks the signature before parsing malformed JSON', () => {
      expectInvalidSig(() => call('{"trackingNumber":', 'sha256=' + '0'.repeat(64)));
    });

    it('rejects an unknown status with a ZodError on status', () => {
      const error = thrown(() => call(JSON.stringify({ ...payload, status: 'LOST' })));
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.some((issue) => issue.path.length === 1 && issue.path[0] === 'status')).toBe(
        true,
      );
    });

    it.each(['[]', 'null', '"text"'])('rejects the JSON value %s with a ZodError', (body) => {
      expect(thrown(() => call(body))).toBeInstanceOf(ZodError);
    });

    it('checks the signature before validating the payload', () => {
      expectInvalidSig(() => callUnsigned(JSON.stringify({ status: 'LOST' })));
    });
  });

  describe('the secret stays secret', () => {
    it('is not visible through JSON.stringify or util.inspect', () => {
      expect(JSON.stringify(adapter)).not.toContain(SECRET);
      expect(inspect(adapter, { depth: 5, showHidden: true })).not.toContain(SECRET);
    });

    it('is not in the message of any AppError thrown above', () => {
      expect(appErrors.length).toBeGreaterThan(0);
      for (const error of appErrors) {
        expect(error.message).not.toContain(SECRET);
      }
    });
  });
});
