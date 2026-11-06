import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db, isDatabaseAvailable } from '../../db/index.js';
import { env } from '../../config/env.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Shallow Liveness Check
   * Responds immediately if process is alive (used by Kubernetes / orchestrator liveness probes).
   */
  fastify.get('/health/live', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'food-scanner-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Deep Readiness Check
   * Verifies database connectivity and operational dependencies before receiving live traffic.
   */
  fastify.get('/health/ready', async (_request, reply) => {
    try {
      const isDbUp = await isDatabaseAvailable();
      if (!isDbUp) {
        if (env.NODE_ENV === 'production') {
          return reply.status(503).send({
            status: 'unhealthy',
            database: 'disconnected',
            timestamp: new Date().toISOString(),
          });
        }
        return reply.status(200).send({
          status: 'ready',
          database: 'offline_dev_mode',
          timestamp: new Date().toISOString(),
        });
      }

      await db.execute(sql`SELECT 1`);
      return reply.status(200).send({
        status: 'ready',
        database: 'connected',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.status(503).send({
        status: 'unhealthy',
        error: err?.message || 'Readiness probe failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * Backward-compatible /health alias
   */
  fastify.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'food-scanner-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });
}
