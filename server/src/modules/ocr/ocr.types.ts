import type {
  FoodForm,
  CompleteEvaluationOutput,
  ConsistencyAuditResult,
  NutritionDeclarationBasis,
  MarketingClaimsAudit,
} from '../engine/types.js';
import type { FssaiLicenseDetails } from '../../common/utils/fssai.js';

export type OcrDeclaredBasis = 'PER_100G' | 'PER_100ML' | 'PER_SERVING' | 'UNKNOWN';

export interface ExtractedNutritionValues {
  energyKcal?: number;
  proteinG?: number;
  carbsG?: number;
  totalSugarG?: number;
  addedSugarG?: number;
  totalFatG?: number;
  saturatedFatG?: number;
  transFatG?: number;
  cholesterolMg?: number;
  sodiumMg?: number;
  saltG?: number;
  fiberG?: number;
}

export interface ExtractedPackagingData {
  productName?: string;
  brandName?: string;
  category?: string;
  form: FoodForm;
  /** Basis of the per-100 values returned below. */
  nutritionBasis?: NutritionDeclarationBasis;
  /** What the OCR text actually declared, before any per-serving conversion. */
  declaredBasis: OcrDeclaredBasis;
  packageWeightGrams?: number;
  servingSizeGrams?: number;
  mrpInr?: number;
  per100g: ExtractedNutritionValues;
  perServing?: ExtractedNutritionValues;
  ingredientsText: string;
  allergenStatement?: string;
  mayContainStatement?: string;
  fssaiLicenses?: FssaiLicenseDetails[];
  marketingClaims?: MarketingClaimsAudit;
}

export interface OcrConfirmationField {
  fieldName: string;
  declaredValue: number | string | undefined;
  confidence: 'HIGH' | 'LOW_CONFIDENCE' | 'SUSPECT';
  warningNote?: string;
  suggestedValue?: number;
}

export interface OcrParseResult {
  barcode?: string;
  extractedData: ExtractedPackagingData;
  plausibilityAudit: ConsistencyAuditResult;
  requiresUserConfirmation: boolean;
  confirmationChecklist: OcrConfirmationField[];
  safetyMessage: string;
}

export interface OcrEvaluationResponse {
  barcode?: string;
  productFacts: {
    productName: string;
    brand: string;
    category: string;
    form: FoodForm;
    nutritionBasis: NutritionDeclarationBasis;
    servingSizeG: number | null;
    packageWeightG: number | null;
  };
  evaluation: CompleteEvaluationOutput;
}

export interface OcrSubmissionResult {
  submissionId: string;
  barcodeGtin: string;
  productName: string;
  brandName: string;
  status: 'ACCEPTED_FOR_CATALOG' | 'PENDING_MODERATION' | 'REJECTED';
  isAvailableForInstantScan: boolean;
  dataProvenance: 'USER_CONTRIBUTED_PENDING' | 'VERIFIED_PACK';
  message: string;
}
