import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type AppConfig } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { prismaPlugin } from './plugins/prisma.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export interface BuildAppOptions {
  /** Overrides merged over the values loaded from the environment (used by tests). */
  config?: Partial<AppConfig>;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config: AppConfig = { ...loadConfig(), ...options.config };

  const app = Fastify({ logger: false });

  app.decorate('config', config);

  app.register(errorHandlerPlugin);
  app.register(prismaPlugin);
  app.register(authPlugin);

  app.get('/health', async () => {
    return { status: 'ok' as const };
  });

  return app;
}
