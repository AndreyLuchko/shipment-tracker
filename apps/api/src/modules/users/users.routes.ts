import type { FastifyPluginAsync } from 'fastify';
import { listUsersQuerySchema, type UserListResponse } from '@shipment-tracker/shared';
import { listUsersByRole } from './users.service.js';

/** User endpoints, registered under `/api/v1/users`. Dispatcher only. */
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.authenticate, app.requireRole('DISPATCHER')] }, async (request) => {
    const { role } = listUsersQuerySchema.parse(request.query);
    const body: UserListResponse = { items: await listUsersByRole(app.prisma, role) };
    return body;
  });
};
