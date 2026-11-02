import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../common/errors/app-error.js';

export interface JwtUserPayload {
  id: string;
  email?: string;
  role: 'USER' | 'BRAND_REP' | 'ADMIN';
  isGuest?: boolean;
  deviceId?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: JwtUserPayload['role'][]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUserPayload;
    user: JwtUserPayload;
  }
}

export async function setupJwt(fastify: FastifyInstance): Promise<void> {
  // 1. Register cookie plugin for refresh tokens
  await fastify.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest',
  });

  // 2. Register Fastify JWT plugin
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
  });

  // 3. Decorate authenticate hook
  fastify.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired authentication token', err);
    }
  });

  // 4. Decorate optionalAuthenticate hook (doesn't fail if token absent)
  fastify.decorate('optionalAuthenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      if (request.headers.authorization || request.cookies.access_token) {
        await request.jwtVerify();
      }
    } catch {
      // Intentionally silent for optional auth
    }
  });

  fastify.decorate('requireRole', (...roles: JwtUserPayload['role'][]) => async (request: FastifyRequest) => {
    if (request.user.isGuest || !roles.includes(request.user.role)) {
      throw new ForbiddenError('This operation requires an authorized curator role');
    }
  });
}
