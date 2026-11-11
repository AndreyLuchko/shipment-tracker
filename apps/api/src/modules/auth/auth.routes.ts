import type { FastifyPluginAsync } from 'fastify';
import { registerSchema, type AuthResponse } from '@shipment-tracker/shared';
import { registerUser } from './auth.service.js';
import { issueSession } from './session.js';

/** Auth endpoints, registered under `/api/v1/auth`. */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await registerUser(app.prisma, input);
    await issueSession(reply, user);
    const body: AuthResponse = { user };
    return reply.code(201).send(body);
  });
};
