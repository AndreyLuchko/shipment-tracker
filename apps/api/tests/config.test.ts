import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';
import { buildTestApp } from './helpers/app.js';

const SECRET = 'a'.repeat(32);
const WEBHOOK = 'w'.repeat(32);
const ENV = { JWT_SECRET: SECRET, WEBHOOK_SECRET: WEBHOOK };

describe('loadConfig', () => {
  it('returns the secrets, defaults cookieSecure to true, and sets the auth rate limit', () => {
    expect(loadConfig(ENV)).toEqual({
      jwtSecret: SECRET,
      cookieSecure: true,
      authRateLimit: { max: 5, timeWindowMs: 60_000 },
      webhookSecret: WEBHOOK,
    });
  });

  it('limits auth endpoints to 5 requests per minute', () => {
    expect(loadConfig(ENV).authRateLimit).toEqual({ max: 5, timeWindowMs: 60000 });
  });

  it("disables Secure cookies only for COOKIE_SECURE='false'", () => {
    expect(loadConfig({ ...ENV, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  });

  it("keeps Secure cookies for COOKIE_SECURE='true'", () => {
    expect(loadConfig({ ...ENV, COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
  });

  it('rejects any other COOKIE_SECURE value', () => {
    expect(() => loadConfig({ ...ENV, COOKIE_SECURE: '0' })).toThrow(/COOKIE_SECURE/);
  });

  it('requires JWT_SECRET', () => {
    expect(() => loadConfig({ WEBHOOK_SECRET: WEBHOOK })).toThrow(/JWT_SECRET is required/);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ ...ENV, JWT_SECRET: 'a'.repeat(31) })).toThrow(
      /JWT_SECRET must be at least 32 characters long/,
    );
  });

  it('requires WEBHOOK_SECRET', () => {
    expect(() => loadConfig({ JWT_SECRET: SECRET })).toThrow(/WEBHOOK_SECRET is required/);
  });

  it('rejects an empty WEBHOOK_SECRET', () => {
    expect(() => loadConfig({ ...ENV, WEBHOOK_SECRET: '' })).toThrow(/WEBHOOK_SECRET is required/);
  });

  it('rejects a WEBHOOK_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ ...ENV, WEBHOOK_SECRET: 'w'.repeat(31) })).toThrow(
      /WEBHOOK_SECRET must be at least 32 characters long/,
    );
  });

  it('never puts the WEBHOOK_SECRET value into the error message', () => {
    const shortSecret = 'w'.repeat(31);
    let message = '';
    try {
      loadConfig({ ...ENV, WEBHOOK_SECRET: shortSecret });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toBe('');
    expect(message).not.toContain(shortSecret);
  });
});

describe('buildTestApp', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('merges config overrides over the environment', async () => {
    app = await buildTestApp({ config: { cookieSecure: false } });

    expect(app.config.cookieSecure).toBe(false);
    expect(app.config.jwtSecret).toBe(process.env['JWT_SECRET']);
  });

  it('takes the webhook secret from the test environment', async () => {
    app = await buildTestApp();

    expect(app.config.webhookSecret).toBe(process.env['WEBHOOK_SECRET']);
    expect(app.config.webhookSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('lets a test override the webhook secret', async () => {
    app = await buildTestApp({ config: { webhookSecret: 'x'.repeat(40) } });

    expect(app.config.webhookSecret).toBe('x'.repeat(40));
  });

  it('registers test-only routes', async () => {
    app = await buildTestApp({ routes: (instance) => instance.get('/__test/ping', async () => ({ pong: true })) });

    const response = await app.inject({ method: 'GET', url: '/__test/ping' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pong: true });
  });
});
