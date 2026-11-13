import {
  CARRIER_SIGNATURE_HEADER_NAME,
  type CarrierWebhookPayload,
  type ShipmentStatus,
} from '@shipment-tracker/shared';
import { signPayload } from '../src/lib/hmac.js';

// Carrier simulator core: scenarios, signing and the runner. No I/O of its own — the caller injects `send`,
// the clock and `sleep` — so importing this module neither reads the environment nor sends anything.

export const WEBHOOK_PATH = '/api/v1/webhooks/carrier';

export const SCENARIO_NAMES = [
  'delivery',
  'direct',
  'exception',
  'recovery',
  'duplicate',
  'illegal',
  'bad-signature',
] as const;
export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export interface ScenarioStep {
  status: ShipmentStatus;
  location?: string;
  note?: string;
  /** HTTP status the API must answer with. */
  expect: number;
  /** `resend`: send the previous request again, byte for byte. `wrong-secret`: sign with a key the API does not know. */
  mode?: 'resend' | 'wrong-secret';
}

export interface Scenario {
  description: string;
  /** Status the shipment must be in before the first step. */
  startsFrom: ShipmentStatus;
  steps: readonly ScenarioStep[];
}

// One fixed Kyiv → Lviv route (M4 decision C16): the simulator cannot read the shipment's real addresses.
const PICKED_UP: ScenarioStep = { status: 'PICKED_UP', location: 'Kyiv depot', expect: 201 };
const IN_TRANSIT: ScenarioStep = { status: 'IN_TRANSIT', location: 'Kyiv sorting hub', expect: 201 };
const OUT_FOR_DELIVERY: ScenarioStep = { status: 'OUT_FOR_DELIVERY', location: 'Lviv depot', expect: 201 };
const DELIVERED: ScenarioStep = {
  status: 'DELIVERED',
  location: 'Lviv, UA',
  note: 'Handed to the recipient',
  expect: 201,
};

export const SCENARIOS: Readonly<Record<ScenarioName, Scenario>> = {
  delivery: {
    description: 'Full journey with a warehouse stop',
    startsFrom: 'CREATED',
    steps: [
      PICKED_UP,
      IN_TRANSIT,
      { status: 'AT_WAREHOUSE', location: 'Zhytomyr warehouse', expect: 201 },
      { status: 'IN_TRANSIT', location: 'Rivne transit hub', expect: 201 },
      OUT_FOR_DELIVERY,
      DELIVERED,
    ],
  },
  direct: {
    description: 'Direct delivery, no warehouse stop',
    startsFrom: 'CREATED',
    steps: [PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED],
  },
  exception: {
    description: 'Journey that stops in EXCEPTION',
    startsFrom: 'CREATED',
    steps: [
      PICKED_UP,
      IN_TRANSIT,
      {
        status: 'EXCEPTION',
        location: 'Zhytomyr warehouse',
        note: 'Parcel damaged in transit, held for inspection',
        expect: 201,
      },
    ],
  },
  recovery: {
    description: 'From EXCEPTION back on the road to DELIVERED',
    startsFrom: 'EXCEPTION',
    steps: [
      { status: 'IN_TRANSIT', location: 'Zhytomyr warehouse', note: 'Released after inspection', expect: 201 },
      OUT_FOR_DELIVERY,
      DELIVERED,
    ],
  },
  duplicate: {
    description: 'The same event delivered twice: 201, then 200',
    startsFrom: 'CREATED',
    steps: [PICKED_UP, { ...PICKED_UP, expect: 200, mode: 'resend' }],
  },
  illegal: {
    description: 'DELIVERED for a shipment that is not out for delivery: 422',
    startsFrom: 'CREATED',
    steps: [{ status: 'DELIVERED', location: 'Lviv, UA', expect: 422 }],
  },
  'bad-signature': {
    description: 'A valid event signed with the wrong secret: 401',
    startsFrom: 'CREATED',
    steps: [{ ...PICKED_UP, expect: 401, mode: 'wrong-secret' }],
  },
};

export interface SignedRequest {
  /** Exact text to send; the signature covers it. */
  body: string;
  headers: Record<string, string>;
}

/** `body` is `JSON.stringify(payload)`; headers are `content-type: application/json` and the signature header. */
export function buildSignedRequest(payload: CarrierWebhookPayload, secret: string): SignedRequest {
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      [CARRIER_SIGNATURE_HEADER_NAME]: signPayload(body, secret),
    },
  };
}

export interface SendResult {
  statusCode: number;
  body: string;
}
export type SendFn = (request: SignedRequest) => Promise<SendResult>;

export interface StepResult {
  step: ScenarioStep;
  /** The `occurredAt` that was sent. */
  occurredAt: string;
  statusCode: number;
  body: string;
  /** `statusCode === step.expect`. */
  ok: boolean;
}

export interface RunScenarioOptions {
  trackingNumber: string;
  scenario: ScenarioName;
  secret: string;
  send: SendFn;
  /** Pause between two steps, in milliseconds; `0` means none. */
  delayMs: number;
  /** Called after every step, in order. */
  onStep?: (result: StepResult, index: number, total: number) => void;
  /** Test seams; default to the real clock and `setTimeout`. */
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sends the steps in order and stops after the first one whose status differs from `expect`. */
export async function runScenario(options: RunScenarioOptions): Promise<StepResult[]> {
  const { trackingNumber, secret, send, delayMs, onStep } = options;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? realSleep;
  const { steps } = SCENARIOS[options.scenario];

  const results: StepResult[] = [];
  let previous: { request: SignedRequest; occurredAt: string } | undefined;

  for (const [index, step] of steps.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    let request: SignedRequest;
    let occurredAt: string;
    if (step.mode === 'resend') {
      if (previous === undefined) {
        throw new Error('resend needs a previous request');
      }
      ({ request, occurredAt } = previous);
    } else {
      // The clock is read when the step is sent (D14), so the event is never stamped in the future.
      occurredAt = now().toISOString();
      const payload: CarrierWebhookPayload = {
        trackingNumber,
        status: step.status,
        ...(step.location !== undefined ? { location: step.location } : {}),
        ...(step.note !== undefined ? { note: step.note } : {}),
        occurredAt,
      };
      request = buildSignedRequest(payload, step.mode === 'wrong-secret' ? `wrong-${secret}` : secret);
    }
    previous = { request, occurredAt };

    const response = await send(request);
    const result: StepResult = {
      step,
      occurredAt,
      statusCode: response.statusCode,
      body: response.body,
      ok: response.statusCode === step.expect,
    };
    results.push(result);
    onStep?.(result, index, steps.length);

    if (!result.ok) {
      break;
    }
  }

  return results;
}
