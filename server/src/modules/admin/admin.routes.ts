import type { FastifyInstance } from 'fastify';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const adminService = new AdminService();
  const controller = new AdminController(adminService);

  const adminAuth = {
    onRequest: [fastify.authenticate, fastify.requireRole('ADMIN')],
  };

  fastify.get('/submissions', adminAuth, controller.handleListSubmissions);
  fastify.post('/submissions/:id/review', adminAuth, controller.handleReviewSubmission);
  fastify.post('/submissions/:id/promote', adminAuth, controller.handlePromoteSubmission);
}
