import type { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(fastify);
  const controller = new AuthController(authService);

  // Public Endpoints
  fastify.get(
    '/username-available',
    {
      onRequest: [fastify.optionalAuthenticate],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    controller.handleCheckUsername
  );
  fastify.post('/guest', controller.handleGuest);
  fastify.post(
    '/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.handleRegister
  );
  fastify.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.handleLogin
  );
  fastify.post(
    '/google',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.handleGoogle
  );
  fastify.post(
    '/forgot-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    controller.handleForgotPassword
  );
  fastify.post(
    '/reset-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    controller.handleResetPassword
  );
  fastify.post('/refresh', controller.handleRefresh);
  fastify.post('/logout', controller.handleLogout);

  // Protected Endpoints (Requires Valid Bearer Token)
  fastify.get('/me', { onRequest: [fastify.authenticate] }, controller.handleMe);
  fastify.patch(
    '/me/username',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    controller.handleUpdateUsername
  );
  fastify.put(
    '/me/username',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    controller.handleUpdateUsername
  );
  fastify.post(
    '/change-password',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    controller.handleChangePassword
  );
  fastify.post(
    '/me/change-password',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    controller.handleChangePassword
  );
}
