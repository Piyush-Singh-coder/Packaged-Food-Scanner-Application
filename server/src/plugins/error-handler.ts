import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../common/errors/app-error.js';

export function setupErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // 1. Zod Schema Validation Errors
    if (error instanceof ZodError) {
      request.log.warn({ issues: error.issues, url: request.url }, 'Zod validation error');
      return reply.status(422).send({
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        error: 'Unprocessable Entity',
        message: 'Request payload validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          rule: issue.code,
        })),
      });
    }

    // 2. Custom Domain AppErrors
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error(error);
      } else {
        request.log.warn({ code: error.code, message: error.message }, 'Application error');
      }

      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        code: error.code,
        error: error.name,
        message: error.message,
        details: error.details,
      });
    }

    // 3. Fastify Native Errors (e.g. 404, bad schema, 400)
    const fastifyError = error as FastifyError;
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({
        statusCode: fastifyError.statusCode,
        code: fastifyError.code || 'BAD_REQUEST',
        error: fastifyError.name || 'Client Error',
        message: fastifyError.message,
      });
    }

    // 4. Uncaught Internal Server Errors
    request.log.error(error, 'Unhandled internal server error');
    return reply.status(500).send({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'Internal Server Error',
      message: 'An unexpected internal error occurred. Please try again later.',
    });
  });
}
