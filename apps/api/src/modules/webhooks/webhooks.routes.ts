import type { FastifyPluginAsync } from 'fastify';
import type { CarrierAdapter } from '../../lib/carriers/types.js';
import { SimulatedCarrierAdapter } from '../../lib/carriers/simulated.js';
import { recordCarrierEvent } from './webhooks.service.js';

/** A valid payload is under 4 KiB; anything larger is answered with `413` before the handler runs. */
export const WEBHOOK_BODY_LIMIT_BYTES = 16 * 1024;

/**
 * Carrier webhooks, registered under `/api/v1/webhooks`. No session and no CSRF: the request is authenticated by
 * its HMAC signature over the raw bytes. Deliberately NOT wrapped in `fastify-plugin` — the raw-body parser
 * below must stay encapsulated in this plugin, every other route keeps Fastify's JSON parsing.
 */
export const webhookRoutes: FastifyPluginAsync = async (app) => {
  const adapter: CarrierAdapter = new SimulatedCarrierAdapter(app.config.webhookSecret);

  // `request.body` is the untouched `Buffer`; any content type other than JSON is a `415`.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/carrier', { bodyLimit: WEBHOOK_BODY_LIMIT_BYTES }, async (request, reply) => {
    // A request with no body and no content type skips the parser: treat it as zero bytes.
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const event = adapter.parseWebhook(rawBody, request.headers);
    const outcome = await recordCarrierEvent(app.prisma, adapter.name, event);
    return reply.code(outcome.created ? 201 : 200).send(outcome.response);
  });
};
