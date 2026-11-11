import type { FastifyPluginAsync } from 'fastify';
import { loginSchema, registerSchema, type AuthResponse } from '@shipment-tracker/shared';
import { getCurrentUser, registerUser, verifyCredentials } from './auth.service.js';
import { clearSession, issueSession } from './session.js';

/** Auth endpoints, registered under `/api/v1/auth`. */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await registerUser(app.prisma, input);
    await issueSession(reply, user);
    const body: AuthResponse = { user };
    return reply.code(201).send(body);
  });

  app.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await verifyCredentials(app.prisma, input);
    await issueSession(reply, user);
    const body: AuthResponse = { user };
    return reply.code(200).send(body);
  });

  app.get('/me', { onRequest: [app.authenticate] }, async (request) => {
    const user = await getCurrentUser(app.prisma, request.user.sub);
    const body: AuthResponse = { user };
    return body;
  });

  app.post('/logout', { onRequest: [app.authenticate] }, async (_request, reply) => {
    clearSession(reply);
    return reply.code(204).send();
  });
};
