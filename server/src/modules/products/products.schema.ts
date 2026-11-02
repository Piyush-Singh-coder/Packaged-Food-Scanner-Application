import { z } from 'zod';
import { normalizeBarcode } from '../../common/utils/barcode.js';

export const barcodeParamSchema = z.object({
  barcode: z
    .string()
    .min(8, 'Barcode must be at least 8 characters')
    .max(18, 'Barcode must not exceed 18 characters')
    .refine((val) => normalizeBarcode(val).isValid, {
      message: 'Invalid barcode or check digit failed verification',
    }),
});

export const productQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createProductSchema = z.object({
  barcodeGtin: z.string().refine((val) => normalizeBarcode(val).isValid, {
    message: 'Invalid barcode format or failed GS1 check digit validation',
  }),
  productName: z.string().min(2).max(200).trim(),
  brandName: z.string().min(1).max(100).trim(),
  categorySlug: z.string().min(2).max(100).trim(),
  subcategorySlug: z.string().min(2).max(100).trim(),
  form: z.enum(['SOLID', 'LIQUID']),
  nutritionBasis: z.enum(['PER_100G', 'PER_100ML']),
  packageWeightG: z.number().positive('Package weight must be greater than zero'),
  servingSizeG: z.number().positive('Serving size must be greater than zero'),
  mrpInr: z.number().nonnegative('MRP must be non-negative'),

  // Mandatory nutrition values per 100g/ml
  energyKcal100g: z.number().nonnegative(),
  proteinG100g: z.number().nonnegative(),
  carbsG100g: z.number().nonnegative(),
  totalSugarG100g: z.number().nonnegative(),
  addedSugarG100g: z.number().nonnegative().optional(),
  addedFatG100g: z.number().nonnegative().optional(),
  totalFatG100g: z.number().nonnegative(),
  saturatedFatG100g: z.number().nonnegative(),
  transFatG100g: z.number().nonnegative().optional(),
  cholesterolMg100g: z.number().nonnegative().optional(),
  sodiumMg100g: z.number().nonnegative().optional(),
  saltG100g: z.number().nonnegative().optional(),
  dietaryFiberG100g: z.number().nonnegative().optional(),

  ingredientsRawText: z.string().trim().min(3, 'Ingredients text is required'),
  nutritionEvidence: z.record(z.any()).optional(),
}).superRefine((value, ctx) => {
  if (value.servingSizeG > value.packageWeightG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['servingSizeG'], message: 'Serving size cannot exceed package weight' });
  }
  if (value.totalSugarG100g > value.carbsG100g) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalSugarG100g'], message: 'Total sugars cannot exceed carbohydrates' });
  }
  if (value.addedSugarG100g !== undefined && value.addedSugarG100g > value.totalSugarG100g) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addedSugarG100g'], message: 'Added sugar cannot exceed total sugars' });
  }
  if (value.saturatedFatG100g > value.totalFatG100g) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['saturatedFatG100g'], message: 'Saturated fat cannot exceed total fat' });
  } else if (value.transFatG100g !== undefined && value.saturatedFatG100g + value.transFatG100g > value.totalFatG100g) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['saturatedFatG100g'], message: 'Saturated and trans fat cannot exceed total fat' });
  }
  if (value.addedFatG100g !== undefined && value.addedFatG100g > value.totalFatG100g) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addedFatG100g'], message: 'Added fat cannot exceed total fat' });
  }
  if (value.sodiumMg100g === undefined && value.saltG100g === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sodiumMg100g'], message: 'Sodium or salt is required' });
  }
});

export type BarcodeParam = z.infer<typeof barcodeParamSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
