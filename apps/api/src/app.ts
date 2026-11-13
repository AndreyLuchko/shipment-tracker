import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, type AppConfig } from './config.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { shipmentRoutes } from './modules/shipments/shipments.routes.js';
import { userRoutes } from './modules/users/users.routes.js';
import { webhookRoutes } from './modules/webhooks/webhooks.routes.js';
import { authPlugin } from './plugins/auth.js';
import { csrfPlugin } from './plugins/csrf.js';
import { errorHandlerPlugin, handleFrameworkError } from './plugins/error-handler.js';
import { prismaPlugin } from './plugins/prisma.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export interface BuildAppOptions {
  /** Overrides merged over the values loaded from the environment (used by tests). */
  config?: Partial<AppConfig>;
  /** Fastify logger options. Omitted means no logging (tests); `server.ts` passes a real logger. */
  logger?: FastifyServerOptions['logger'];
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config: AppConfig = { ...loadConfig(), ...options.config };

  const app = Fastify({ logger: options.logger ?? false, frameworkErrors: handleFrameworkError });

  app.decorate('config', config);

  app.register(errorHandlerPlugin);
  app.register(prismaPlugin);
  app.register(csrfPlugin);
  app.register(authPlugin);
  // Opt-in per route via `config.rateLimit`; registered before the routes so their hooks are attached.
  app.register(rateLimit, { global: false });

  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(shipmentRoutes, { prefix: '/api/v1/shipments' });
  app.register(userRoutes, { prefix: '/api/v1/users' });
  app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });

  app.get('/health', async () => {
    return { status: 'ok' as const };
  });

  return app;
}
