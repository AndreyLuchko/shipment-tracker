import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Shipment } from '@prisma/client';
import type { StepResult } from '../../scripts/carrier-simulator.js';
import { USAGE, formatStepLine, parseCliArgs, runCli } from '../../scripts/simulator-cli.js';
import { buildTestApp } from '../helpers/app.js';
import { registerTestUser } from '../helpers/auth.js';
import { resetDb } from '../helpers/db.js';
import { createTestShipment } from '../helpers/shipments.js';

describe('parseCliArgs', () => {
  it('defaults scenario, delay and base URL', () => {
    expect(parseCliArgs(['ST-2026-000003'])).toEqual({
      kind: 'run',
      options: {
        trackingNumber: 'ST-2026-000003',
        scenario: 'delivery',
        delayMs: 1000,
        baseUrl: 'http://localhost:3001',
      },
    });
  });

  it('reads every option and strips the trailing slash of the URL', () => {
    expect(
      parseCliArgs(['ST-1', '--scenario', 'duplicate', '--delay', '0', '--url', 'https://api.example.com/']),
    ).toEqual({
      kind: 'run',
      options: { trackingNumber: 'ST-1', scenario: 'duplicate', delayMs: 0, baseUrl: 'https://api.example.com' },
    });
  });

  it('accepts --option=value before the positional', () => {
    expect(parseCliArgs(['--scenario=illegal', 'ST-1'])).toEqual({
      kind: 'run',
      options: { trackingNumber: 'ST-1', scenario: 'illegal', delayMs: 1000, baseUrl: 'http://localhost:3001' },
    });
  });

  it.each([[['--help']], [['-h']], [['ST-1', '--help']]])('%j asks for help', (argv) => {
    expect(parseCliArgs(argv)).toEqual({ kind: 'help' });
  });

  it.each([[[]], [['ST-1', 'ST-2']]])('%j is an error about the tracking number', (argv) => {
    const parsed = parseCliArgs(argv);
    expect(parsed.kind).toBe('error');
    expect(parsed.kind === 'error' && parsed.message).toContain('trackingNumber');
  });

  it('rejects an unknown scenario', () => {
    expect(parseCliArgs(['ST-1', '--scenario', 'nope'])).toEqual({
      kind: 'error',
      message: 'Unknown scenario "nope"',
    });
  });

  it.each([
    [['ST-1', '--delay', 'abc']],
    [['ST-1', '--delay=1.5']],
    [['ST-1', '--delay=-5']],
    [['ST-1', '--delay', '60001']],
  ])('%j is a --delay error', (argv) => {
    const parsed = parseCliArgs(argv);
    expect(parsed.kind).toBe('error');
    expect(parsed.kind === 'error' && parsed.message).toContain('--delay');
  });

  it('accepts the maximum delay', () => {
    const parsed = parseCliArgs(['ST-1', '--delay', '60000']);
    expect(parsed.kind === 'run' && parsed.options.delayMs).toBe(60000);
  });

  it.each([[['ST-1', '--url', 'nope']], [['ST-1', '--url', 'ftp://example.com']]])('%j is a --url error', (argv) => {
    const parsed = parseCliArgs(argv);
    expect(parsed.kind).toBe('error');
    expect(parsed.kind === 'error' && parsed.message).toContain('--url');
  });

  it('rejects an unknown option', () => {
    expect(parseCliArgs(['ST-1', '--bogus']).kind).toBe('error');
  });
});

describe('formatStepLine', () => {
  const result = (overrides: Partial<StepResult['step']>, statusCode: number): StepResult => {
    const step = { status: 'PICKED_UP' as const, location: 'Kyiv depot', expect: 201, ...overrides };
    return { step, occurredAt: '2026-11-12T10:00:00.000Z', statusCode, body: '', ok: statusCode === step.expect };
  };

  it('formats a successful step', () => {
    expect(formatStepLine(result({}, 201), 0, 6)).toBe('[1/6] PICKED_UP @ Kyiv depot -> 201 ok');
  });

  it('marks a resend', () => {
    expect(formatStepLine(result({ mode: 'resend', expect: 200 }, 200), 1, 2)).toBe(
      '[2/2] PICKED_UP @ Kyiv depot (resend) -> 200 ok',
    );
  });

  it('marks a wrong secret', () => {
    expect(formatStepLine(result({ mode: 'wrong-secret', expect: 401 }, 401), 0, 1)).toContain(
      '(wrong secret) -> 401 ok',
    );
  });

  it('reports a mismatch with the expected status', () => {
    expect(formatStepLine(result({}, 404), 0, 6)).toBe('[1/6] PICKED_UP @ Kyiv depot -> 404 MISMATCH (expected 201)');
  });

  it('prints a dash for a step without location', () => {
    const noLocation: StepResult = {
      step: { status: 'PICKED_UP', expect: 201 },
      occurredAt: '2026-11-12T10:00:00.000Z',
      statusCode: 201,
      body: '',
      ok: true,
    };
    expect(formatStepLine(noLocation, 0, 1)).toContain('@ - ->');
  });
});

describe('runCli', () => {
  const TRACKING = 'ST-TEST-CLI';
  const WEBHOOK = 'http://localhost:3001/api/v1/webhooks/carrier';

  let app: FastifyInstance;
  let shipment: Shipment;
  let out: string[];
  let err: string[];
  let urls: string[];

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app.prisma);
    const owner = await registerTestUser(app);
    shipment = await createTestShipment(app.prisma, owner.user.id, { trackingNumber: TRACKING });
    out = [];
    err = [];
    urls = [];
  });

  afterEach(() => {
    const secret = app.config.webhookSecret;
    for (const line of [...out, ...err]) {
      expect(line).not.toContain(secret);
    }
  });

  function fetchVia(target: FastifyInstance, recorded: string[]): typeof fetch {
    return async (input, init) => {
      const url = new URL(String(input));
      recorded.push(url.href);
      const response = await target.inject({
        method: 'POST',
        url: url.pathname,
        headers: init?.headers as Record<string, string>,
        payload: init?.body as string,
      });
      return new Response(response.body, { status: response.statusCode });
    };
  }

  const cli = (argv: string[], env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch) =>
    runCli(argv, env ?? { WEBHOOK_SECRET: app.config.webhookSecret }, {
      fetch: fetchImpl ?? fetchVia(app, urls),
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });

  async function snapshot(id: string) {
    const row = await app.prisma.shipment.findUniqueOrThrow({
      where: { id },
      select: { status: true, updatedAt: true, _count: { select: { events: true } } },
    });
    return { status: row.status, updatedAt: row.updatedAt, eventCount: row._count.events };
  }

  it('runs the delivery scenario end to end', async () => {
    expect(await cli([TRACKING, '--delay', '0'])).toBe(0);

    const row = await app.prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(row.status).toBe('DELIVERED');
    expect(out[0]).toBe(`Scenario "delivery" for ${TRACKING} at http://localhost:3001`);
    const stepLines = out.slice(1, -1);
    expect(stepLines).toHaveLength(6);
    stepLines.forEach((line, index) => {
      expect(line.startsWith(`[${index + 1}/6]`)).toBe(true);
      expect(line.endsWith('ok')).toBe(true);
    });
    expect(out.at(-1)).toBe('Scenario "delivery": all 6 steps answered as expected.');
    expect(err).toEqual([]);
  });

  it('posts every event to the default webhook URL', async () => {
    await cli([TRACKING, '--delay', '0']);
    expect(urls).toHaveLength(6);
    expect(urls.every((url) => url === WEBHOOK)).toBe(true);
  });

  it('posts to the given base URL', async () => {
    expect(await cli([TRACKING, '--delay', '0', '--url', 'https://api.example.com/'])).toBe(0);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url === 'https://api.example.com/api/v1/webhooks/carrier')).toBe(true);
  });

  it('treats the duplicate resend as expected', async () => {
    expect(await cli([TRACKING, '--scenario', 'duplicate', '--delay', '0'])).toBe(0);
    expect(out.some((line) => line.includes('(resend) -> 200 ok'))).toBe(true);
  });

  it('treats the expected 422 of the illegal scenario as success', async () => {
    const before = await snapshot(shipment.id);
    expect(await cli([TRACKING, '--scenario', 'illegal'])).toBe(0);
    expect(await snapshot(shipment.id)).toEqual(before);
  });

  it('treats the expected 401 of the bad-signature scenario as success', async () => {
    const before = await snapshot(shipment.id);
    expect(await cli([TRACKING, '--scenario', 'bad-signature'])).toBe(0);
    expect(await snapshot(shipment.id)).toEqual(before);
  });

  it('stops at the first mismatch and prints the response body', async () => {
    expect(await cli(['ST-NOPE', '--delay', '0'])).toBe(1);
    const stepLines = out.filter((line) => line.startsWith('['));
    expect(stepLines).toHaveLength(1);
    expect(stepLines[0]).toContain('-> 404 MISMATCH (expected 201)');
    expect(err[0]).toBe('Scenario "delivery": step 1 answered 404, expected 201.');
    expect(err[1]).toContain('Shipment not found');
    expect(urls).toHaveLength(1);
  });

  it('fails with 401 when signed with a secret the API does not know', async () => {
    const before = await snapshot(shipment.id);
    expect(await cli([TRACKING, '--delay', '0'], { WEBHOOK_SECRET: 'x'.repeat(32) })).toBe(1);
    expect(err[0]).toContain('answered 401, expected 201');
    expect(await snapshot(shipment.id)).toEqual(before);
  });

  it.each([[{}], [{ WEBHOOK_SECRET: '' }]])('exits 2 without a secret (%j)', async (env) => {
    expect(await cli([TRACKING], env)).toBe(2);
    expect(err[0]).toContain('WEBHOOK_SECRET');
    expect(urls).toEqual([]);
  });

  it('exits 2 with the usage on a missing tracking number', async () => {
    expect(await cli([])).toBe(2);
    const index = err.findIndex((line) => line.includes('trackingNumber'));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(err.slice(index + 1)).toContain(USAGE);
    expect(urls).toEqual([]);
  });

  it('exits 2 on an unknown scenario', async () => {
    expect(await cli([TRACKING, '--scenario', 'nope'])).toBe(2);
    expect(err[0]).toBe('Unknown scenario "nope"');
  });

  it('prints the usage for --help', async () => {
    expect(await cli(['--help'])).toBe(0);
    expect(out).toEqual([USAGE]);
    expect(urls).toEqual([]);
  });

  it('exits 1 when the request itself fails', async () => {
    const failing: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await cli([TRACKING, '--delay', '0'], undefined, failing)).toBe(1);
    expect(err[0]).toBe('Request failed: fetch failed. Is the API running at http://localhost:3001?');
  });
});
