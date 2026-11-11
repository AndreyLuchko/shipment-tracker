import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';
import { buildTestApp } from './helpers/app.js';

const SECRET = 'a'.repeat(32);

describe('loadConfig', () => {
  it('returns the secret and defaults cookieSecure to true', () => {
    expect(loadConfig({ JWT_SECRET: SECRET })).toEqual({ jwtSecret: SECRET, cookieSecure: true });
  });

  it("disables Secure cookies only for COOKIE_SECURE='false'", () => {
    expect(loadConfig({ JWT_SECRET: SECRET, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  });

  it("keeps Secure cookies for COOKIE_SECURE='true'", () => {
    expect(loadConfig({ JWT_SECRET: SECRET, COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
  });

  it('rejects any other COOKIE_SECURE value', () => {
    expect(() => loadConfig({ JWT_SECRET: SECRET, COOKIE_SECURE: '0' })).toThrow(/COOKIE_SECURE/);
  });

  it('requires JWT_SECRET', () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ JWT_SECRET: 'a'.repeat(31) })).toThrow(/JWT_SECRET/);
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

  it('registers test-only routes', async () => {
    app = await buildTestApp({ routes: (instance) => instance.get('/__test/ping', async () => ({ pong: true })) });

    const response = await app.inject({ method: 'GET', url: '/__test/ping' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pong: true });
  });
});
