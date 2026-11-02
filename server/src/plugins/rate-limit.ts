import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/**
 * Process-local safety limit for the API.
 * Uses client IP as the primary rate-limit boundary so unauthenticated callers
 * cannot bypass rate limits by rotating the X-Device-Id header.
 */
export async function setupRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const userId = (request.user as any)?.id;
      return userId ? `${request.ip}:${userId}` : request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too Many Requests',
      message: `Too many requests. Try again in ${context.after}.`,
    }),
  });
}
