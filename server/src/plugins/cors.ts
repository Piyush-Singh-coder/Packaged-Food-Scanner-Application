import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from '../config/env.js';

export async function setupCors(fastify: FastifyInstance): Promise<void> {
  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Requested-With'],
  });
}
