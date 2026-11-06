import type { FastifyRequest, FastifyReply } from 'fastify';
import { AdminService } from './admin.service.js';
import {
  listSubmissionsQuerySchema,
  reviewSubmissionParamSchema,
  reviewSubmissionBodySchema,
} from './admin.schema.js';

export class AdminController {
  constructor(private adminService: AdminService) {}

  public handleListSubmissions = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listSubmissionsQuerySchema.parse(request.query);
    const result = await this.adminService.listSubmissions(query);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public handleReviewSubmission = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = reviewSubmissionParamSchema.parse(request.params);
    const body = reviewSubmissionBodySchema.parse(request.body);
    const reviewerId = (request.user as any)?.id || '00000000-0000-0000-0000-000000000001';
    const result = await this.adminService.reviewSubmission(id, reviewerId, body);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public handlePromoteSubmission = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = reviewSubmissionParamSchema.parse(request.params);
    const reviewerId = (request.user as any)?.id || '00000000-0000-0000-0000-000000000001';
    const result = await this.adminService.promoteSubmission(id, reviewerId);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };
}
