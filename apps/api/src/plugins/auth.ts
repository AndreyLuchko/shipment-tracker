import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ACCESS_TOKEN_COOKIE_NAME, roleSchema, type Role } from '@shipment-tracker/shared';
import { AppError } from '../lib/errors.js';

/** Lifetime of a session: the JWT `exp` and both cookies' `Max-Age`. */
export const SESSION_TTL_SECONDS = 86_400;

/** Claims carried by the session JWT. `csrf` binds the CSRF cookie to this session. */
export interface SessionClaims {
  sub: string;
  role: Role;
  csrf: string;
}

const sessionClaimsSchema = z.object({ sub: z.string(), role: roleSchema, csrf: z.string() });

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionClaims;
    user: SessionClaims;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** `onRequest` hook: requires a valid session cookie, otherwise 401 UNAUTHORIZED. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** `onRequest` hook factory, used after `authenticate`: requires the given role, otherwise 403 FORBIDDEN. */
    requireRole: (role: Role) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Session layer: HS256 JWT in the HttpOnly `access_token` cookie, plus `authenticate` / `requireRole` guards. */
export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: app.config.jwtSecret,
    cookie: { cookieName: ACCESS_TOKEN_COOKIE_NAME, signed: false },
    sign: { algorithm: 'HS256', expiresIn: SESSION_TTL_SECONDS },
    verify: { algorithms: ['HS256'] },
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    if (!sessionClaimsSchema.safeParse(request.user).success) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
  });

  app.decorate('requireRole', (role: Role) => async (request: FastifyRequest) => {
    if (request.user.role !== role) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
  });
});
