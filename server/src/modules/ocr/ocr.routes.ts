import type { FastifyInstance } from 'fastify';
import { OcrController } from './ocr.controller.js';

export async function ocrRoutes(app: FastifyInstance): Promise<void> {
  const controller = new OcrController();

  /**
   * POST /api/v1/ocr/parse
   * Extracts packaging metadata, per-100g & per-serve nutrition, and runs plausibility audit.
   */
  app.post('/parse', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, controller.parse);

  /**
   * POST /api/v1/ocr/evaluate
   * Directly evaluates confirmed nutrition facts against ICMR Table 15.1 and multi-persona lenses.
   */
  app.post('/evaluate', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, controller.evaluate);

  /**
   * POST /api/v1/ocr/submit
   * Stages crowd-sourced unlisted product scan into ingestion queue with anti-poisoning plausibility gating.
   */
  app.post('/submit', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, controller.submit);
}
