export interface AppConfig {
  /** HS256 signing secret for the session JWT. At least 32 characters. */
  jwtSecret: string;
  /** Whether auth cookies carry the `Secure` attribute. Only `COOKIE_SECURE=false` turns it off. */
  cookieSecure: boolean;
  /** Per-IP limit applied separately to `POST /auth/login` and `POST /auth/register`. */
  authRateLimit: { max: number; timeWindowMs: number };
}

const MIN_JWT_SECRET_LENGTH = 32;
const AUTH_RATE_LIMIT = { max: 5, timeWindowMs: 60_000 } as const;

/** Reads and validates the API configuration. Throws on a missing or invalid variable, naming it. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env['JWT_SECRET'];
  if (jwtSecret === undefined || jwtSecret === '') {
    throw new Error('JWT_SECRET is required');
  }
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
  }

  return {
    jwtSecret,
    cookieSecure: parseCookieSecure(env['COOKIE_SECURE']),
    authRateLimit: { ...AUTH_RATE_LIMIT },
  };
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
