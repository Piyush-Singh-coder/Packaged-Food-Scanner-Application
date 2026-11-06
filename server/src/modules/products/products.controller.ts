import type { FastifyReply, FastifyRequest } from 'fastify';
import { ProductsService } from './products.service.js';
import { barcodeParamSchema, productQuerySchema, createProductSchema } from './products.schema.js';

export class ProductsController {
  constructor(private productsService: ProductsService) {}

  /**
   * GET /api/v1/products/barcode/:barcode
   */
  public handleGetByBarcode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { barcode } = barcodeParamSchema.parse(request.params);
    const result = await this.productsService.getProductByBarcode(barcode);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  /**
   * GET /api/v1/products
   */
  public handleSearch = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = productQuerySchema.parse(request.query);
    const result = await this.productsService.searchProducts(query);
    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  /**
   * POST /api/v1/products (Protected)
   */
  public handleCreate = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createProductSchema.parse(request.body);
    const userRole = (request.user as any)?.role;
    const isTrusted = userRole === 'ADMIN';
    const result = await this.productsService.createProduct(input, { isTrusted });
    return reply.status(201).send({
      success: true,
      data: result,
    });
  };
}
