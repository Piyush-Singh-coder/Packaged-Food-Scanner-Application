import type { FastifyInstance } from 'fastify';
import { SwapsController } from './swaps.controller.js';

export async function swapsRoutes(app: FastifyInstance): Promise<void> {
  const controller = new SwapsController();

  /**
   * GET /api/v1/swaps/:barcode
   * Same-aisle price-aware healthier product discovery.
   * Query parameters:
   *  - persona: 'ADULT' | 'DIABETIC' | 'INFANT' | 'CHILD' | 'CARDIAC' | 'RENAL' (default: 'ADULT')
   *  - allergens: string (comma-separated, e.g. 'ALLERGEN_GLUTEN,ALLERGEN_MILK')
   *  - maxPriceRatio: number (default: 1.2; hard-clamped to ±20% parity)
   *  - limit: number (default: 3)
   *  - allowCrossCategory: boolean (default: false)
   */
  app.get('/:barcode', controller.getSwaps);
}
