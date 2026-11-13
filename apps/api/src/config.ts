export interface AppConfig {
  /** HS256 signing secret for the session JWT. At least 32 characters. */
  jwtSecret: string;
  /** Whether auth cookies carry the `Secure` attribute. Only `COOKIE_SECURE=false` turns it off. */
  cookieSecure: boolean;
  /** Per-IP limit applied separately to `POST /auth/login` and `POST /auth/register`. */
  authRateLimit: { max: number; timeWindowMs: number };
  /** HMAC-SHA256 key of `X-Carrier-Signature`. At least 32 characters. */
  webhookSecret: string;
  /** Per-IP limit of `POST /webhooks/carrier`. */
  webhookRateLimit: { max: number; timeWindowMs: number };
}

const MIN_SECRET_LENGTH = 32;
const AUTH_RATE_LIMIT = { max: 5, timeWindowMs: 60_000 } as const;
const WEBHOOK_RATE_LIMIT = { max: 120, timeWindowMs: 60_000 } as const;

/** Reads and validates the API configuration. Throws on a missing or invalid variable, naming it. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = readSecret(env, 'JWT_SECRET');
  const webhookSecret = readSecret(env, 'WEBHOOK_SECRET');

  return {
    jwtSecret,
    cookieSecure: parseCookieSecure(env['COOKIE_SECURE']),
    authRateLimit: { ...AUTH_RATE_LIMIT },
    webhookSecret,
    webhookRateLimit: { ...WEBHOOK_RATE_LIMIT },
  };
}

/** Reads a required secret of at least `MIN_SECRET_LENGTH` characters. Errors name the variable, never its value. */
function readSecret(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters long`);
  }
  return value;
}

function parseCookieSecure(value: string | undefined): boolean {
  if (value === undefined || value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`COOKIE_SECURE must be "true" or "false", got "${value}"`);
}
