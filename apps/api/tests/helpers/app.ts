import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from '../../src/app.js';
import type { AppConfig } from '../../src/config.js';

export interface BuildTestAppOptions {
  config?: Partial<AppConfig>;
  /** Passed through to `buildApp`; omitted means a silent logger. */
  logger?: BuildAppOptions['logger'];
  /** Test-only routes, registered after the app's plugins so their decorators are available. */
  routes?: (app: FastifyInstance) => void;
}

/** High enough that test files which are not about rate limiting never trip the auth limiter. */
const TEST_AUTH_RATE_LIMIT: AppConfig['authRateLimit'] = { max: 1000, timeWindowMs: 60_000 };

/** Builds the real app (optionally with config overrides and extra routes) and waits until it is ready. */
export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<FastifyInstance> {
  const app = buildApp({
    config: { authRateLimit: TEST_AUTH_RATE_LIMIT, ...options.config },
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });

  const { routes } = options;
  if (routes !== undefined) {
    app.register(async (instance) => {
      routes(instance);
    });
  }

  await app.ready();
  return app;
}
