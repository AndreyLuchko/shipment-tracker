import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ErrorCode, ErrorDetail, ErrorResponse } from '@shipment-tracker/shared';
import { AppError, VALIDATION_FAILED_MESSAGE } from '../lib/errors.js';

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

/**
 * One detail per Zod issue — except `unrecognized_keys`, which Zod reports once per object with the object's
 * own path; it is expanded into one detail per refused key so the client can tell which field was rejected.
 */
function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({ path: [...issue.path, key].join('.'), message: 'Unrecognized key' }))
      : [{ path: issue.path.join('.'), message: issue.message }],
  );
}

/**
 * Passed to `Fastify({ frameworkErrors })`. Answers the failures the router raises before any hook or handler
 * runs (a path parameter over 100 characters → 414, a malformed percent-encoding → 400), which never reach
 * `setErrorHandler`. A named function on purpose: an inline arrow in `Fastify({ … })` loses its parameter types.
 */
export function handleFrameworkError(error: FastifyError, _request: FastifyRequest, reply: FastifyReply): void {
  void sendError(reply, error.statusCode ?? 400, 'BAD_REQUEST', error.message);
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
      return sendError(reply, 400, 'VALIDATION_ERROR', VALIDATION_FAILED_MESSAGE, zodDetails(error));
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
