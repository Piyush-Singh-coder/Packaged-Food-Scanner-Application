import { buildApp } from './app.js';
import { env } from './config/env.js';

async function startServer(): Promise<void> {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    app.log.info(`🚀 Food Scanner Server running at: ${address}`);
    app.log.info(`📡 Health Check available at: ${address}/api/v1/health`);
    app.log.info(`🔐 Auth Endpoints mounted at: ${address}/api/v1/auth`);
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Gracefully closing Fastify server...`);
    try {
      await app.close();
      app.log.info('Server closed successfully.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error while closing server');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('Fatal server startup failure:', err);
  process.exit(1);
});
