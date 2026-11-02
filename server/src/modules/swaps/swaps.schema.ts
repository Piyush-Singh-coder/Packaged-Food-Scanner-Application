import { z } from 'zod';
import { normalizeBarcode } from '../../common/utils/barcode.js';

export const swapParamsSchema = z.object({
  barcode: z
    .string()
    .trim()
    .refine(
      (val) => {
        const norm = normalizeBarcode(val);
        return norm.isValid && Boolean(norm.normalizedGtin13);
      },
      {
        message: 'Invalid barcode or check digit failed GS1 modulo-10 verification',
      }
    ),
});

export const swapQuerySchema = z.object({
  persona: z
    .enum(['ADULT', 'DIABETIC', 'INFANT', 'CHILD', 'CARDIAC', 'RENAL'])
    .default('ADULT'),
  allergens: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return [];
      return val
        .split(',')
        .map((a) => a.trim().toUpperCase())
        .filter(Boolean);
    }),
  // Product policy is a price-premium ceiling relative to the scanned item's
  // price per 100g. Cheaper alternatives are always allowed; a caller may
  // tighten but never widen the premium ceiling. There is deliberately no 0.8
  // lower boundary here: that would be a price floor, not a ceiling.
  maxPriceRatio: z.coerce.number().gt(0).max(1.2).default(1.2),
  limit: z.coerce.number().int().min(1).max(10).default(3),
  allowCrossCategory: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

export type SwapParams = z.infer<typeof swapParamsSchema>;
export type SwapQuery = z.infer<typeof swapQuerySchema>;
