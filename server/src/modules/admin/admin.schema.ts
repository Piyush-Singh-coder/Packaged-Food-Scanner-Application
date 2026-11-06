import { z } from 'zod';

export const listSubmissionsQuerySchema = z.object({
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ALL']).optional().default('PENDING_REVIEW'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const reviewSubmissionParamSchema = z.object({
  id: z.string().uuid('Invalid submission ID format'),
});

export const reviewSubmissionBodySchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  notes: z.string().max(1000).optional(),
  checklist: z.record(z.boolean()).optional().default({}),
});

export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
export type ReviewSubmissionBody = z.infer<typeof reviewSubmissionBodySchema>;
