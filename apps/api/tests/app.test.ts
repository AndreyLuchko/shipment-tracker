import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';

describe('buildApp logger option', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('writes unhandled errors to the provided logger', async () => {
    const lines: string[] = [];
    app = await buildTestApp({
      logger: { level: 'error', stream: { write: (line: string) => void lines.push(line) } },
      routes: (instance) => {
        instance.get('/__test/boom', async () => {
          throw new Error('boom');
        });
      },
    });

    const response = await app.inject({ method: 'GET', url: '/__test/boom' });

    expect(response.statusCode).toBe(500);
    const entries = lines.map((line) => JSON.parse(line) as { msg?: string; err?: { message?: string } });
    expect(entries).toContainEqual(
      expect.objectContaining({ msg: 'Unhandled error', err: expect.objectContaining({ message: 'boom' }) }),
    );
  });
});
