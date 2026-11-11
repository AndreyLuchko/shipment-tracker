import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ErrorCode, ErrorDetail, ErrorResponse } from '@shipment-tracker/shared';
import { AppError } from '../lib/errors.js';

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): FastifyReply {
  const body: ErrorResponse = { error: details === undefined ? { code, message } : { code, message, details } };
  return reply.status(statusCode).send(body);
}

/** Fastify's own errors (body parsing, content type, payload size…) carry a 4xx `statusCode`. */
function clientStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return undefined;
  }
  const { statusCode } = error;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 499 ? statusCode : undefined;
}

/** Turns every failure into `{ error: { code, message, details? } }` — the single error envelope of the API. */
export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      return sendError(reply, error.statusCode, error.code, error.message, error.details);
    }

    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
    }

    const statusCode = clientStatusCode(error);
    if (statusCode === 429) {
      // Thrown by @fastify/rate-limit, which has already set the `retry-after` header on the reply.
      return sendError(reply, 429, 'RATE_LIMITED', 'Too many requests, please try again later');
    }
    if (statusCode !== undefined) {
      const message = error instanceof Error ? error.message : 'Bad request';
      return sendError(reply, statusCode, 'BAD_REQUEST', message);
    }

    request.log.error({ err: error }, 'Unhandled error');
    return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
  });

  app.setNotFoundHandler((_request, reply) => sendError(reply, 404, 'NOT_FOUND', 'Route not found'));
});
