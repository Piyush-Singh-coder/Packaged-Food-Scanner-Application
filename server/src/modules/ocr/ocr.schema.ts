import { z } from 'zod';
import { normalizeBarcode } from '../../common/utils/barcode.js';

export const ocrParseSchema = z.object({
  barcode: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const norm = normalizeBarcode(val);
        return norm.isValid && Boolean(norm.normalizedGtin13);
      },
      { message: 'Invalid barcode or check digit failed verification' }
    ),
  rawText: z
    .string()
    .min(10, 'OCR raw text must be at least 10 characters long to extract packaging info'),
  imageUrl: z.string().url().optional(),
});

export const ocrEvaluateSchema = z.object({
  barcode: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const norm = normalizeBarcode(val);
        return norm.isValid && Boolean(norm.normalizedGtin13);
      },
      { message: 'Invalid barcode or check digit failed verification' }
    ),
  productName: z.string().trim().default('Unlisted Scanned Food'),
  brandName: z.string().trim().default('Generic Brand'),
  category: z.string().trim().default('Packaged Foods'),
  form: z.enum(['SOLID', 'LIQUID']).default('SOLID'),
  nutritionBasis: z.enum(['PER_100G', 'PER_100ML']),
  packageWeightGrams: z.coerce.number().positive().optional(),
  servingSizeGrams: z.coerce.number().positive().optional(),
  energyKcal: z.coerce.number().nonnegative(),
  proteinG: z.coerce.number().nonnegative(),
  carbsG: z.coerce.number().nonnegative(),
  totalSugarG: z.coerce.number().nonnegative(),
  addedSugarG: z.coerce.number().nonnegative().optional(),
  addedFatG: z.coerce.number().nonnegative().optional(),
  totalFatG: z.coerce.number().nonnegative(),
  saturatedFatG: z.coerce.number().nonnegative(),
  transFatG: z.coerce.number().nonnegative().optional(),
  cholesterolMg: z.coerce.number().nonnegative().optional(),
  sodiumMg: z.coerce.number().nonnegative().optional(),
  saltG: z.coerce.number().nonnegative().optional(),
  fiberG: z.coerce.number().nonnegative().optional(),
  ingredientsText: z.string().trim().default(''),
}).superRefine((value, ctx) => {
  if (value.servingSizeGrams !== undefined
    && value.packageWeightGrams !== undefined
    && value.servingSizeGrams > value.packageWeightGrams) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['servingSizeGrams'], message: 'Serving size cannot exceed package weight' });
  }
  if (value.totalSugarG > value.carbsG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalSugarG'], message: 'Total sugars cannot exceed carbohydrates' });
  }
  if (value.addedSugarG !== undefined && value.addedSugarG > value.totalSugarG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addedSugarG'], message: 'Added sugar cannot exceed total sugars' });
  }
  if (value.saturatedFatG > value.totalFatG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['saturatedFatG'], message: 'Saturated fat cannot exceed total fat' });
  } else if (value.transFatG !== undefined && value.saturatedFatG + value.transFatG > value.totalFatG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['saturatedFatG'], message: 'Saturated and trans fat cannot exceed total fat' });
  }
  if (value.addedFatG !== undefined && value.addedFatG > value.totalFatG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addedFatG'], message: 'Added fat cannot exceed total fat' });
  }
  if (value.sodiumMg === undefined && value.saltG === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sodiumMg'], message: 'Sodium or salt is required' });
  }
});

export const ocrSubmitSchema = z.object({
  barcode: z
    .string()
    .trim()
    .refine(
      (val) => {
        const norm = normalizeBarcode(val);
        return norm.isValid && Boolean(norm.normalizedGtin13);
      },
      { message: 'Valid GS1 barcode is required for catalog ingestion' }
    ),
  deviceId: z.string().optional(),
  productName: z.string().trim().min(2, 'Product name must be at least 2 characters'),
  brandName: z.string().trim().min(2, 'Brand name must be at least 2 characters'),
  category: z.string().trim().min(2, 'Category must be at least 2 characters'),
  form: z.enum(['SOLID', 'LIQUID']).default('SOLID'),
  nutritionBasis: z.enum(['PER_100G', 'PER_100ML']),
  packageWeightGrams: z.coerce.number().positive(),
  servingSizeGrams: z.coerce.number().positive(),
  mrpInr: z.coerce.number().nonnegative().optional(),
  energyKcal: z.coerce.number().nonnegative(),
  proteinG: z.coerce.number().nonnegative(),
  carbsG: z.coerce.number().nonnegative(),
  totalSugarG: z.coerce.number().nonnegative(),
  addedSugarG: z.coerce.number().nonnegative().optional(),
  addedFatG: z.coerce.number().nonnegative().optional(),
  totalFatG: z.coerce.number().nonnegative(),
  saturatedFatG: z.coerce.number().nonnegative(),
  transFatG: z.coerce.number().nonnegative().optional(),
  cholesterolMg: z.coerce.number().nonnegative().optional(),
  sodiumMg: z.coerce.number().nonnegative().optional(),
  saltG: z.coerce.number().nonnegative().optional(),
  fiberG: z.coerce.number().nonnegative().optional(),
  ingredientsText: z.string().trim().min(5, 'Ingredients raw text is required'),
}).superRefine((value, ctx) => {
  if (value.servingSizeGrams > value.packageWeightGrams) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['servingSizeGrams'], message: 'Serving size cannot exceed package weight' });
  }
  if (value.totalSugarG > value.carbsG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalSugarG'], message: 'Total sugars cannot exceed carbohydrates' });
  }
  if (value.addedSugarG !== undefined && value.addedSugarG > value.totalSugarG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addedSugarG'], message: 'Added sugar cannot exceed total sugars' });
  }
  if (value.saturatedFatG > value.totalFatG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['saturatedFatG'], message: 'Saturated fat cannot exceed total fat' });
  } else if (value.transFatG !== undefined && value.saturatedFatG + value.transFatG > value.totalFatG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['saturatedFatG'], message: 'Saturated and trans fat cannot exceed total fat' });
  }
  if (value.addedFatG !== undefined && value.addedFatG > value.totalFatG) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['addedFatG'], message: 'Added fat cannot exceed total fat' });
  }
  if (value.sodiumMg === undefined && value.saltG === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sodiumMg'], message: 'Sodium or salt is required' });
  }
});

export type OcrParseInput = z.infer<typeof ocrParseSchema>;
export type OcrEvaluateInput = z.infer<typeof ocrEvaluateSchema>;
export type OcrSubmitInput = z.infer<typeof ocrSubmitSchema>;
