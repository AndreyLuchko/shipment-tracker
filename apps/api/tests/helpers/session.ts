import type { FastifyInstance } from 'fastify';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME, type Role } from '@shipment-tracker/shared';
import { issueSession } from '../../src/modules/auth/session.js';

/** Test-only `POST /__test/session` route: starts a session for the `{ id, role }` in the body. */
export function sessionRoute(app: FastifyInstance): void {
  app.post('/__test/session', async (request, reply) => {
    await issueSession(reply, request.body as { id: string; role: Role });
    return reply.code(204).send();
  });
}

/** Starts a session through `POST /__test/session` and returns its cookies. */
export async function startSession(app: FastifyInstance, role: Role = 'CLIENT') {
  const response = await app.inject({ method: 'POST', url: '/__test/session', payload: { id: 'user_1', role } });
  const byName = Object.fromEntries(response.cookies.map((cookie) => [cookie.name, cookie]));
  return {
    access: byName[ACCESS_TOKEN_COOKIE_NAME]!,
    csrf: byName[CSRF_COOKIE_NAME]!,
    cookies: { access_token: byName[ACCESS_TOKEN_COOKIE_NAME]!.value, csrf_token: byName[CSRF_COOKIE_NAME]!.value },
  };
}
