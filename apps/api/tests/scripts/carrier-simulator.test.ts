import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { carrierWebhookPayloadSchema, type CarrierWebhookPayload, type ShipmentStatus } from '@shipment-tracker/shared';
import {
  SCENARIOS,
  SCENARIO_NAMES,
  buildSignedRequest,
  runScenario,
  type ScenarioName,
  type SendFn,
  type SignedRequest,
  type StepResult,
} from '../../scripts/carrier-simulator.js';
import { verifySignature } from '../../src/lib/hmac.js';
import { buildTestApp } from '../helpers/app.js';
import { registerTestUser, type TestSession } from '../helpers/auth.js';
import { resetDb } from '../helpers/db.js';
import { createTestShipment } from '../helpers/shipments.js';
import { isLegalTransition } from '../helpers/transitions.js';
import { WEBHOOK_URL, signBody } from '../helpers/webhooks.js';

const SECRET = 's'.repeat(32);
const SIGNATURE_HEADER = 'x-carrier-signature';

const statusesOf = (name: ScenarioName) => SCENARIOS[name].steps.map((step) => step.status);

describe('SCENARIOS', () => {
  it('lists the seven scenario names in order, each with a scenario', () => {
    expect(SCENARIO_NAMES).toEqual([
      'delivery',
      'direct',
      'exception',
      'recovery',
      'duplicate',
      'illegal',
      'bad-signature',
    ]);
    expect(Object.keys(SCENARIOS).sort()).toEqual([...SCENARIO_NAMES].sort());
  });

  it('delivery walks the full journey with a warehouse stop', () => {
    expect(statusesOf('delivery')).toEqual([
      'PICKED_UP',
      'IN_TRANSIT',
      'AT_WAREHOUSE',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
  });

  it('direct skips the warehouse', () => {
    expect(statusesOf('direct')).toEqual(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  });

  it('exception ends in EXCEPTION with a note', () => {
    const last = SCENARIOS.exception.steps.at(-1);
    expect(last?.status).toBe('EXCEPTION');
    expect(last?.note).toBeTruthy();
  });

  it('recovery starts from EXCEPTION and ends DELIVERED', () => {
    expect(SCENARIOS.recovery.startsFrom).toBe('EXCEPTION');
    expect(SCENARIOS.recovery.steps.at(-1)?.status).toBe('DELIVERED');
  });

  it.each(['delivery', 'direct', 'exception', 'recovery'] as const)(
    '%s: every step expects 201, has no mode and is a legal transition',
    (name) => {
      let current: ShipmentStatus = SCENARIOS[name].startsFrom;
      for (const step of SCENARIOS[name].steps) {
        expect(step.expect).toBe(201);
        expect(step.mode).toBeUndefined();
        expect(isLegalTransition(current, step.status)).toBe(true);
        current = step.status;
      }
    },
  );

  it('duplicate resends the first step and expects 201 then 200', () => {
    const [first, second] = SCENARIOS.duplicate.steps;
    expect(SCENARIOS.duplicate.steps.map((step) => step.expect)).toEqual([201, 200]);
    expect(second?.mode).toBe('resend');
    expect(second?.status).toBe(first?.status);
  });

  it('illegal is one illegal step expecting 422', () => {
    const { startsFrom, steps } = SCENARIOS.illegal;
    expect(steps).toHaveLength(1);
    expect(steps[0]?.expect).toBe(422);
    expect(isLegalTransition(startsFrom, steps[0]!.status)).toBe(false);
  });

  it('bad-signature is one wrong-secret step expecting 401', () => {
    const { steps } = SCENARIOS['bad-signature'];
    expect(steps).toHaveLength(1);
    expect(steps[0]?.expect).toBe(401);
    expect(steps[0]?.mode).toBe('wrong-secret');
  });

  it('every step of every scenario makes a valid webhook payload', () => {
    for (const name of SCENARIO_NAMES) {
      for (const { status, location, note } of SCENARIOS[name].steps) {
        const result = carrierWebhookPayloadSchema.safeParse({
          trackingNumber: 'ST-2026-000001',
          status,
          location,
          note,
          occurredAt: '2026-11-12T10:00:00.000Z',
        });
        expect(result.success, `${name} / ${status}`).toBe(true);
      }
    }
  });
});

describe('buildSignedRequest', () => {
  const payload: CarrierWebhookPayload = {
    trackingNumber: 'ST-2026-000001',
    status: 'PICKED_UP',
    location: 'Kyiv depot',
    occurredAt: '2026-11-12T10:00:00.000Z',
  };

  it('sends JSON.stringify(payload) as the body', () => {
    expect(buildSignedRequest(payload, SECRET).body).toBe(JSON.stringify(payload));
  });

  it('sets the content type and the signature of the body', () => {
    expect(buildSignedRequest(payload, SECRET).headers).toEqual({
      'content-type': 'application/json',
      'x-carrier-signature': signBody(JSON.stringify(payload), SECRET),
    });
  });

  it('produces a signature the API verifies', () => {
    const request = buildSignedRequest(payload, SECRET);
    expect(verifySignature(Buffer.from(request.body), request.headers[SIGNATURE_HEADER], SECRET)).toBe(true);
  });
});

describe('runScenario with fakes', () => {
  const START = Date.parse('2026-11-12T10:00:00.000Z');

  function fakes() {
    const requests: SignedRequest[] = [];
    const sleeps: number[] = [];
    const steps: Array<{ index: number; total: number }> = [];
    let clock = 0;
    return {
      requests,
      sleeps,
      steps,
      now: () => new Date(START + 1000 * clock++),
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      onStep: (_result: StepResult, index: number, total: number) => {
        steps.push({ index, total });
      },
    };
  }

  /** Answers every step with its own `expect` unless `answers` overrides it. */
  function run(scenario: ScenarioName, delayMs: number, answers?: number[]) {
    const f = fakes();
    const scripted = answers ?? SCENARIOS[scenario].steps.map((step) => step.expect);
    const send: SendFn = async (request) => {
      const index = f.requests.length;
      f.requests.push(request);
      return { statusCode: scripted[index] ?? 0, body: '{}' };
    };
    const promise = runScenario({
      trackingNumber: 'ST-2026-000001',
      scenario,
      secret: SECRET,
      send,
      delayMs,
      onStep: f.onStep,
      now: f.now,
      sleep: f.sleep,
    });
    return { f, promise };
  }

  it('delivery: sends six signed steps, stamps each with the clock, sleeps between steps', async () => {
    const { f, promise } = run('delivery', 250);
    const results = await promise;

    expect(f.requests).toHaveLength(6);
    const bodies = f.requests.map((request) => JSON.parse(request.body) as Record<string, unknown>);
    SCENARIOS.delivery.steps.forEach((step, index) => {
      expect(bodies[index]).toMatchObject({
        trackingNumber: 'ST-2026-000001',
        status: step.status,
        location: step.location,
      });
    });
    expect(bodies.map((body) => body['occurredAt'])).toEqual([
      '2026-11-12T10:00:00.000Z',
      '2026-11-12T10:00:01.000Z',
      '2026-11-12T10:00:02.000Z',
      '2026-11-12T10:00:03.000Z',
      '2026-11-12T10:00:04.000Z',
      '2026-11-12T10:00:05.000Z',
    ]);
    expect(f.sleeps).toEqual([250, 250, 250, 250, 250]);
    expect(f.steps).toEqual([0, 1, 2, 3, 4, 5].map((index) => ({ index, total: 6 })));
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('delivery with delayMs 0 never sleeps', async () => {
    const { f, promise } = run('delivery', 0);
    await promise;
    expect(f.sleeps).toEqual([]);
  });

  it('duplicate resends the very same request', async () => {
    const { f, promise } = run('duplicate', 0);
    const results = await promise;

    expect(f.requests[1]).toEqual(f.requests[0]);
    expect(results[1]?.occurredAt).toBe(results[0]?.occurredAt);
    expect(results.map((result) => result.statusCode)).toEqual([201, 200]);
  });

  it('bad-signature sends a valid payload signed with a different secret', async () => {
    const { f, promise } = run('bad-signature', 0);
    await promise;

    const request = f.requests[0]!;
    const signature = request.headers[SIGNATURE_HEADER];
    expect(carrierWebhookPayloadSchema.safeParse(JSON.parse(request.body)).success).toBe(true);
    expect(verifySignature(Buffer.from(request.body), signature, SECRET)).toBe(false);
    expect(verifySignature(Buffer.from(request.body), signature, `wrong-${SECRET}`)).toBe(true);
  });

  it('stops after the first unexpected status code', async () => {
    const { f, promise } = run('delivery', 10, [201, 500]);
    const results = await promise;

    expect(results).toHaveLength(2);
    expect(results[1]?.ok).toBe(false);
    expect(f.requests).toHaveLength(2);
    expect(f.sleeps).toHaveLength(1);
  });

  it('rejects when send rejects', async () => {
    const error = new Error('boom');
    await expect(
      runScenario({
        trackingNumber: 'ST-2026-000001',
        scenario: 'delivery',
        secret: SECRET,
        delayMs: 0,
        send: () => Promise.reject(error),
        sleep: async () => {},
      }),
    ).rejects.toBe(error);
  });
});

describe('scenarios against the real app', () => {
  let app: FastifyInstance;
  let owner: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    owner = await registerTestUser(app);
  });

  const send: SendFn = async (request) => {
    const response = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: request.headers,
      payload: request.body,
    });
    return { statusCode: response.statusCode, body: response.body };
  };

  const run = (scenario: ScenarioName, trackingNumber: string) =>
    runScenario({ trackingNumber, scenario, secret: app.config.webhookSecret, send, delayMs: 0 });

  const fixture = (status?: ShipmentStatus) =>
    createTestShipment(app.prisma, owner.user.id, status === undefined ? {} : { status });

  const eventsOf = (shipmentId: string) =>
    app.prisma.movementEvent.findMany({
      where: { shipmentId },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });

  async function snapshot(id: string) {
    const row = await app.prisma.shipment.findUniqueOrThrow({
      where: { id },
      select: { status: true, updatedAt: true, _count: { select: { events: true } } },
    });
    return { status: row.status, updatedAt: row.updatedAt, eventCount: row._count.events };
  }

  const currentStatus = async (id: string) =>
    (await app.prisma.shipment.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  it('delivery takes a CREATED shipment to DELIVERED', async () => {
    const shipment = await fixture();
    const results = await run('delivery', shipment.trackingNumber);

    expect(results).toHaveLength(6);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await currentStatus(shipment.id)).toBe('DELIVERED');
    const events = await eventsOf(shipment.id);
    expect(events).toHaveLength(7);
    expect(events.filter((event) => event.source === 'WEBHOOK')).toHaveLength(6);
    expect(events.map((event) => event.status)).toEqual([
      'CREATED',
      'PICKED_UP',
      'IN_TRANSIT',
      'AT_WAREHOUSE',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
  });

  it('direct takes a CREATED shipment to DELIVERED in four events', async () => {
    const shipment = await fixture();
    const results = await run('direct', shipment.trackingNumber);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(await currentStatus(shipment.id)).toBe('DELIVERED');
    expect(await eventsOf(shipment.id)).toHaveLength(5);
  });

  it('exception, then recovery on the same shipment', async () => {
    const shipment = await fixture();

    const first = await run('exception', shipment.trackingNumber);
    expect(first.every((result) => result.ok)).toBe(true);
    expect(await currentStatus(shipment.id)).toBe('EXCEPTION');
    expect((await eventsOf(shipment.id)).at(-1)?.note).not.toBeNull();

    const second = await run('recovery', shipment.trackingNumber);
    expect(second.every((result) => result.ok)).toBe(true);
    expect(await currentStatus(shipment.id)).toBe('DELIVERED');
  });

  it('duplicate stores one event and answers 201 then 200', async () => {
    const shipment = await fixture();
    const results = await run('duplicate', shipment.trackingNumber);

    expect(results.map((result) => result.statusCode)).toEqual([201, 200]);
    expect(results.every((result) => result.ok)).toBe(true);
    const events = await eventsOf(shipment.id);
    expect(events.filter((event) => event.status === 'PICKED_UP')).toHaveLength(1);
  });

  it('illegal answers 422 and leaves the shipment untouched', async () => {
    const shipment = await fixture();
    const before = await snapshot(shipment.id);
    const results = await run('illegal', shipment.trackingNumber);

    expect(results.map((result) => result.statusCode)).toEqual([422]);
    expect(results[0]?.ok).toBe(true);
    expect(await snapshot(shipment.id)).toEqual(before);
  });

  it('bad-signature answers 401 and leaves the shipment untouched', async () => {
    const shipment = await fixture();
    const before = await snapshot(shipment.id);
    const results = await run('bad-signature', shipment.trackingNumber);

    expect(results.map((result) => result.statusCode)).toEqual([401]);
    expect(results[0]?.ok).toBe(true);
    expect(await snapshot(shipment.id)).toEqual(before);
  });

  it('delivery for an unknown tracking number stops at the first 404', async () => {
    const results = await run('delivery', 'ST-NOPE');

    expect(results).toHaveLength(1);
    expect(results[0]?.statusCode).toBe(404);
    expect(results[0]?.ok).toBe(false);
  });

  it('delivery on a DELIVERED shipment stops at the first 422', async () => {
    const shipment = await fixture('DELIVERED');
    const results = await run('delivery', shipment.trackingNumber);

    expect(results).toHaveLength(1);
    expect(results[0]?.statusCode).toBe(422);
    expect(results[0]?.ok).toBe(false);
  });
});
