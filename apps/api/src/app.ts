import Fastify, { type FastifyInstance } from 'fastify';
import { prismaPlugin } from './plugins/prisma.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(prismaPlugin);

  app.get('/health', async () => {
    return { status: 'ok' as const };
  });

  return app;
}
