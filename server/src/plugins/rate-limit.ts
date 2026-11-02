import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/**
 * Process-local safety limit for the API. A shared Redis store should be wired
 * for multi-instance deployments; the local limiter still protects a single
 * instance and test/dev environments from accidental request floods.
 */
export async function setupRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const headerDeviceId = request.headers['x-device-id'];
      const deviceId = typeof headerDeviceId === 'string'
        ? headerDeviceId.trim()
        : Array.isArray(headerDeviceId)
          ? headerDeviceId[0]?.trim()
          : undefined;
      const userId = (request.user as any)?.id;
      return deviceId || userId || request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too Many Requests',
      message: `Too many requests. Try again in ${context.after}.`,
    }),
  });
}
