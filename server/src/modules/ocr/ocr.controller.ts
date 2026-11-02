import type { FastifyRequest, FastifyReply } from 'fastify';
import { OcrService } from './ocr.service.js';
import { ocrParseSchema, ocrEvaluateSchema, ocrSubmitSchema } from './ocr.schema.js';

export class OcrController {
  private ocrService: OcrService;

  constructor() {
    this.ocrService = new OcrService();
  }

  public parse = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = ocrParseSchema.parse(request.body);
    const result = await this.ocrService.parsePackagingText(input);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public evaluate = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = ocrEvaluateSchema.parse(request.body);
    const result = await this.ocrService.evaluateConfirmedData(input);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  public submit = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = ocrSubmitSchema.parse(request.body);
    const userId = request.user?.isGuest ? undefined : request.user?.id;

    const result = await this.ocrService.submitCrowdContribution(input, userId);

    return reply.status(201).send({
      success: true,
      data: result,
    });
  };
}
