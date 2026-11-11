import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config.js';

export interface BuildTestAppOptions {
  config?: Partial<AppConfig>;
  /** Test-only routes, registered after the app's plugins so their decorators are available. */
  routes?: (app: FastifyInstance) => void;
}

/** Builds the real app (optionally with config overrides and extra routes) and waits until it is ready. */
export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<FastifyInstance> {
  const app = buildApp({ config: options.config });

  const { routes } = options;
  if (routes !== undefined) {
    app.register(async (instance) => {
      routes(instance);
    });
  }

  await app.ready();
  return app;
}
