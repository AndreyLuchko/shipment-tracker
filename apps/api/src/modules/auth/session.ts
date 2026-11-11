import { randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_COOKIE_NAME, type Role } from '@shipment-tracker/shared';
import { SESSION_TTL_SECONDS } from '../../plugins/auth.js';

/** Starts a session: a fresh CSRF token, bound into a new JWT, both set as cookies on the reply. */
export async function issueSession(reply: FastifyReply, user: { id: string; role: Role }): Promise<void> {
  const csrf = randomBytes(32).toString('base64url');
  const token = await reply.jwtSign({ sub: user.id, role: user.role, csrf });

  const cookieOptions = {
    secure: reply.server.config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  } as const;

  reply.setCookie(ACCESS_TOKEN_COOKIE_NAME, token, { ...cookieOptions, httpOnly: true });
  reply.setCookie(CSRF_COOKIE_NAME, csrf, { ...cookieOptions, httpOnly: false });
}

/** Ends a session on the client by clearing both cookies. */
export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { path: '/' });
  reply.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
}
