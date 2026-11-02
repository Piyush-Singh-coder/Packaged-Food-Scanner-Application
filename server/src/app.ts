import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { setupCors } from './plugins/cors.js';
import { setupJwt } from './plugins/jwt.js';
import { setupErrorHandler } from './plugins/error-handler.js';
import { setupRateLimit } from './plugins/rate-limit.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { productsRoutes } from './modules/products/products.routes.js';
import { swapsRoutes } from './modules/swaps/swaps.routes.js';
import { ocrRoutes } from './modules/ocr/ocr.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    // Do not trust arbitrary client-supplied forwarding headers. Configure a
    // known proxy explicitly at the deployment layer if one is used.
    trustProxy: false,
  });

  // 1. Global Security & Utility Plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(sensible);
  await setupCors(app);
  await setupJwt(app);
  await setupRateLimit(app);
  setupErrorHandler(app);

  // 2. Feature Routes under /api/v1
  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(productsRoutes, { prefix: '/api/v1/products' });
  await app.register(swapsRoutes, { prefix: '/api/v1/swaps' });
  await app.register(ocrRoutes, { prefix: '/api/v1/ocr' });

  return app;
}
