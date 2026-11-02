import type { FastifyRequest, FastifyReply } from 'fastify';
import { SwapsService } from './swaps.service.js';
import { swapParamsSchema, swapQuerySchema } from './swaps.schema.js';

export class SwapsController {
  private swapsService: SwapsService;

  constructor() {
    this.swapsService = new SwapsService();
  }

  public getSwaps = async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Validate URL params (GS1 check digit validation)
    const params = swapParamsSchema.parse(request.params);

    // 2. Validate query params (Persona, allergens, price ratio, limit)
    const query = swapQuerySchema.parse(request.query);

    // 3. Execute deterministic swap engine
    const data = await this.swapsService.findSwaps(params.barcode, query);

    return reply.status(200).send({
      success: true,
      data,
    });
  };
}
