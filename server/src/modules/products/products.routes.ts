import type { FastifyInstance } from 'fastify';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  const productsService = new ProductsService();
  const controller = new ProductsController(productsService);

  // Public Endpoints for In-Aisle Mobile Lookups
  fastify.get('/barcode/:barcode', controller.handleGetByBarcode);
  fastify.get('/', controller.handleSearch);

  // Protected Ingestion Endpoint for Admin / Brand Curation
  fastify.post('/', { onRequest: [fastify.authenticate, fastify.requireRole('ADMIN', 'BRAND_REP')] }, controller.handleCreate);
}
