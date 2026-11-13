import { parseArgs } from 'node:util';
import {
  SCENARIO_NAMES,
  WEBHOOK_PATH,
  runScenario,
  type ScenarioName,
  type SendFn,
  type StepResult,
} from './carrier-simulator.js';

// Carrier simulator CLI layer: argv parsing, output and the exit code. All I/O is injected (`CliDeps`), so
// importing this module has no side effects and Vitest drives it end to end without a network.

export const DEFAULT_BASE_URL = 'http://localhost:3001';
export const DEFAULT_DELAY_MS = 1000;
export const MAX_DELAY_MS = 60_000;

export const USAGE = `Usage: npm run simulate -w apps/api -- <trackingNumber> [options]

Fires signed carrier webhook events at the API.

Options:
  --scenario <name>  delivery (default) | direct | exception | recovery | duplicate | illegal | bad-signature
  --delay <ms>       pause between events, 0-60000 (default 1000)
  --url <baseUrl>    API base URL (default http://localhost:3001)
  -h, --help         show this help

The signing key is read from WEBHOOK_SECRET (apps/api/.env).
Exit code: 0 when every event was answered as the scenario expects, 1 otherwise, 2 on a usage error.`;

export interface CliOptions {
  trackingNumber: string;
  scenario: ScenarioName;
  delayMs: number;
  /** Without a trailing slash. */
  baseUrl: string;
}

export type ParsedArgs = { kind: 'run'; options: CliOptions } | { kind: 'help' } | { kind: 'error'; message: string };

const isScenarioName = (value: string): value is ScenarioName => (SCENARIO_NAMES as readonly string[]).includes(value);

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        scenario: { type: 'string' },
        delay: { type: 'string' },
        url: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;

  if (values.help === true) {
    return { kind: 'help' };
  }
  if (positionals.length !== 1) {
    return { kind: 'error', message: 'Expected exactly one <trackingNumber>' };
  }

  const scenario = values.scenario ?? 'delivery';
  if (!isScenarioName(scenario)) {
    return { kind: 'error', message: `Unknown scenario "${scenario}"` };
  }

  let delayMs = DEFAULT_DELAY_MS;
  if (values.delay !== undefined) {
    if (!/^\d+$/.test(values.delay) || Number(values.delay) > MAX_DELAY_MS) {
      return { kind: 'error', message: `--delay must be an integer from 0 to ${MAX_DELAY_MS}` };
    }
    delayMs = Number(values.delay);
  }

  const url = values.url ?? DEFAULT_BASE_URL;
  if (!isHttpUrl(url)) {
    return { kind: 'error', message: '--url must be an http(s) URL' };
  }

  return {
    kind: 'run',
    options: { trackingNumber: positionals[0]!, scenario, delayMs, baseUrl: url.replace(/\/+$/, '') },
  };
}

const MODE_SUFFIX = { resend: ' (resend)', 'wrong-secret': ' (wrong secret)' } as const;

export function formatStepLine(result: StepResult, index: number, total: number): string {
  const { step, statusCode, ok } = result;
  const suffix = step.mode === undefined ? '' : MODE_SUFFIX[step.mode];
  const outcome = ok ? 'ok' : `MISMATCH (expected ${step.expect})`;
  return `[${index + 1}/${total}] ${step.status} @ ${step.location ?? '-'}${suffix} -> ${statusCode} ${outcome}`;
}

export interface CliDeps {
  fetch: typeof fetch;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

/** Runs the CLI and returns the process exit code: 0 as expected, 1 mismatch or network failure, 2 usage. */
export async function runCli(argv: string[], env: NodeJS.ProcessEnv, deps: CliDeps): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (parsed.kind === 'help') {
    deps.stdout(USAGE);
    return 0;
  }
  if (parsed.kind === 'error') {
    deps.stderr(parsed.message);
    deps.stderr(USAGE);
    return 2;
  }

  const secret = env['WEBHOOK_SECRET'];
  if (secret === undefined || secret === '') {
    deps.stderr('WEBHOOK_SECRET is not set (expected in apps/api/.env)');
    return 2;
  }

  const { trackingNumber, scenario, delayMs, baseUrl } = parsed.options;
  deps.stdout(`Scenario "${scenario}" for ${trackingNumber} at ${baseUrl}`);

  const send: SendFn = async (request) => {
    const response = await deps.fetch(baseUrl + WEBHOOK_PATH, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    return { statusCode: response.status, body: await response.text() };
  };

  let results: StepResult[];
  try {
    results = await runScenario({
      trackingNumber,
      scenario,
      secret,
      send,
      delayMs,
      onStep: (result, index, total) => deps.stdout(formatStepLine(result, index, total)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.stderr(`Request failed: ${message}. Is the API running at ${baseUrl}?`);
    return 1;
  }

  const failedIndex = results.findIndex((result) => !result.ok);
  if (failedIndex === -1) {
    deps.stdout(`Scenario "${scenario}": all ${results.length} steps answered as expected.`);
    return 0;
  }
  const failed = results[failedIndex]!;
  deps.stderr(
    `Scenario "${scenario}": step ${failedIndex + 1} answered ${failed.statusCode}, expected ${failed.step.expect}.`,
  );
  deps.stderr(failed.body);
  return 1;
}
