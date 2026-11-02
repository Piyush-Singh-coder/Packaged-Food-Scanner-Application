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
    .enum(['ADULT', 'DIABETIC', 'INFANT', 'INFANT_UNDER_2', 'CHILD', 'CHILD_OVER_2', 'CARDIAC', 'RENAL'])
    .default('ADULT')
    .transform((val): 'ADULT' | 'DIABETIC' | 'INFANT' | 'CHILD' | 'CARDIAC' | 'RENAL' => {
      if (val === 'INFANT_UNDER_2') return 'INFANT';
      if (val === 'CHILD_OVER_2') return 'CHILD';
      return val;
    }),
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
  maxPriceRatio: z.coerce.number().gt(0).max(1.2).default(1.2),
  limit: z.coerce.number().int().min(1).max(10).default(3),
  allowCrossCategory: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

export type SwapParams = z.infer<typeof swapParamsSchema>;
export type SwapQuery = z.infer<typeof swapQuerySchema>;
