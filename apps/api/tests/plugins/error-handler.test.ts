import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { errorResponseSchema, registerSchema } from '@shipment-tracker/shared';
import { AppError } from '../../src/lib/errors.js';
import { buildTestApp } from '../helpers/app.js';

function testRoutes(app: FastifyInstance): void {
  app.get('/__test/app-error', async () => {
    throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
  });
  app.post('/__test/zod', async (request) => registerSchema.parse(request.body));
  app.get('/__test/boom', async () => {
    throw new Error('db password is hunter2');
  });
}

function expectEnvelope(response: LightMyRequestResponse): void {
  expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
}

describe('errorHandlerPlugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp({ routes: testRoutes });
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps an AppError to its status, code and message without a details key', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/app-error' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({ error: { code: 'EMAIL_TAKEN', message: 'Email is already registered' } });
    expectEnvelope(response);
  });

  it('maps a ZodError to 400 VALIDATION_ERROR with one detail per issue', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__test/zod',
      payload: { email: 'bad', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: { code: string; message: string; details: { path: string; message: string }[] };
    }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Request validation failed');

    const paths = body.error.details.map((detail) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'name']));
    for (const detail of body.error.details) {
      expect(typeof detail.message).toBe('string');
      expect(detail.message.length).toBeGreaterThan(0);
    }
    expectEnvelope(response);
  });

  it('maps an unexpected error to 500 INTERNAL_ERROR without leaking its message', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toStrictEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(response.body).not.toContain('hunter2');
    expectEnvelope(response);
  });

  it('answers an unknown route with 404 NOT_FOUND', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
    expectEnvelope(response);
  });

  it('maps malformed JSON to 400 BAD_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__test/zod',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('BAD_REQUEST');
    expectEnvelope(response);
  });

  it('maps an empty JSON body to 400 BAD_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__test/zod',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('BAD_REQUEST');
    expectEnvelope(response);
  });

  it('maps an unsupported content type to 415 BAD_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__test/zod',
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('BAD_REQUEST');
    expectEnvelope(response);
  });
});
