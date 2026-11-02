import { getNutritionSource } from './source-registry.js';
import type {
  NutritionEvidence,
  NutritionEvidenceMap,
  NutritionField,
  RawNutritionInput,
} from './types.js';

export type SourceIntegrityStatus = 'SOURCE_BACKED' | 'DERIVED_SOURCE_BACKED' | 'INCOMPLETE' | 'UNSUPPORTED';

export interface SourceIntegrityReport {
  status: SourceIntegrityStatus;
  completeForEvaluation: boolean;
  unsupportedFields: NutritionField[];
  missingFields: NutritionField[];
  derivedFields: NutritionField[];
  optionalMissingFields: NutritionField[];
  basisMismatchFields: NutritionField[];
  notes: string[];
}

export class SourceBackedDataError extends Error {
  public readonly report: SourceIntegrityReport;

  constructor(report: SourceIntegrityReport) {
    super('Nutrition data is incomplete or lacks an approved source reference');
    this.name = 'SourceBackedDataError';
    this.report = report;
  }
}

/**
 * A grade is allowed only when every value that drives the grade is both
 * declared and source-backed. The FSSAI mandatory label set is the floor:
 * energy, protein, carbohydrate, total sugar, added sugar, total fat,
 * saturated fat, trans fat other than natural, cholesterol, and sodium/salt.
 *
 * Added fat and fibre are not universal Indian mandatory fields; they are
 * optional and are reported as limitations, never converted into zero.
 */
const requiredForEvaluation: NutritionField[] = [
  'energyKcal',
  'proteinG',
  'carbsG',
  'totalSugarG',
  'addedSugarG',
  'totalFatG',
  'saturatedFatG',
  'transFatG',
  'cholesterolMg',
];

const optionalForEvaluation: NutritionField[] = [
  'addedFatG',
  'fiberG',
];

const numericFields: NutritionField[] = [
  'energyKcal',
  'proteinG',
  'carbsG',
  'totalSugarG',
  'addedSugarG',
  'addedFatG',
  'totalFatG',
  'saturatedFatG',
  'transFatG',
  'cholesterolMg',
  'sodiumMg',
  'saltG',
  'fiberG',
];

function hasNumericValue(input: RawNutritionInput, field: NutritionField): boolean {
  const value = input[field];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isProductLabelSource(evidence: NutritionEvidence): boolean {
  if (evidence.kind !== 'MANUFACTURER_LABEL') return false;
  if (evidence.verificationStatus !== 'VERIFIED') return false;

  const hasReviewedArtefact = Boolean(evidence.artifactHash || evidence.sourceUrl || evidence.capturedAt);
  if (!hasReviewedArtefact) return false;

  return /^(PACK_PHOTO|MANUFACTURER_LABEL|LAB_TEST|OCR_CAPTURE):/.test(evidence.sourceId);
}

/**
 * The registry also stores advisory and clinical sources for citations. Those
 * sources describe thresholds or guidance, not the nutrient composition of a
 * particular food, so they must never be accepted as field-level nutrition
 * evidence. IFCT is currently the only registered composition table.
 */
function isCompositionSource(sourceId: string): boolean {
  return sourceId === 'ICMR_NIN_IFCT_2017';
}

function isEvidenceAllowed(
  evidence: NutritionEvidence,
  context: 'PACKAGED_PRODUCT' | 'GENERIC_FOOD'
): boolean {
  if (evidence.kind === 'MANUFACTURER_LABEL') return isProductLabelSource(evidence);

  if (evidence.kind === 'DERIVED') {
    const derivedFromSodium = evidence.sourceId === 'SODIUM_TO_SALT_2_5';
    const derivedFromSalt = evidence.sourceId === 'SALT_TO_SODIUM_400';
    return (derivedFromSodium || derivedFromSalt)
      && Boolean(evidence.formula)
      && Boolean(evidence.inputFields?.length);
  }

  if (evidence.kind === 'OFFICIAL_RESEARCH_TABLE' || evidence.kind === 'PEER_REVIEWED_RESEARCH') {
    if (context !== 'GENERIC_FOOD') return false;
    const registered = getNutritionSource(evidence.sourceId);
    return registered !== undefined
      && registered.kind === evidence.kind
      && isCompositionSource(evidence.sourceId)
      && Boolean(evidence.locator);
  }

  return false;
}

/**
 * Source gate for nutrition facts.
 *
 * This class intentionally does not contain a food-composition fallback. It
 * never turns a missing value into zero, never estimates added sugar from total
 * sugar, never estimates saturated fat from total fat, and never treats a
 * parsed ingredient name as a nutrient measurement.
 */
export class SourceBackedNutritionEngine {
  public static inspect(input: RawNutritionInput): SourceIntegrityReport {
    const evidence = input.nutritionEvidence ?? {};
    const unsupportedFields: NutritionField[] = [];
    const missingFields: NutritionField[] = [];
    const derivedFields: NutritionField[] = [];
    const optionalMissingFields: NutritionField[] = [];
    const basisMismatchFields: NutritionField[] = [];
    const notes: string[] = [];
    const declaredBasis = input.nutritionBasis;
    const context = input.nutritionContext ?? 'PACKAGED_PRODUCT';

    for (const field of numericFields) {
      const hasValue = hasNumericValue(input, field);
      const fieldEvidence = evidence[field];

      if (!hasValue) {
        if (requiredForEvaluation.includes(field)) missingFields.push(field);
        else if (optionalForEvaluation.includes(field)) optionalMissingFields.push(field);
        continue;
      }

      if (!fieldEvidence || !isEvidenceAllowed(fieldEvidence, context)) {
        unsupportedFields.push(field);
        continue;
      }

      const evidenceBasis = fieldEvidence.basis;
      if ((evidenceBasis === 'PER_100G' || evidenceBasis === 'PER_100ML')
        && evidenceBasis !== declaredBasis) {
        basisMismatchFields.push(field);
        notes.push(
          `${field} is declared on ${declaredBasis} but its evidence is on ${evidenceBasis}; the values are not silently converted.`
        );
        continue;
      }
      if (evidenceBasis !== 'PER_100G' && evidenceBasis !== 'PER_100ML') {
        basisMismatchFields.push(field);
        notes.push(`${field} evidence is on ${evidenceBasis}, not a per-100 declaration.`);
        continue;
      }

      if (fieldEvidence.kind === 'DERIVED') {
        derivedFields.push(field);
        if (fieldEvidence.inputFields?.some((inputField) => !hasNumericValue(input, inputField))) {
          unsupportedFields.push(field);
          notes.push(`${field} claims to be derived but one or more input fields are absent.`);
        }
      }
    }

    // Sodium and salt are alternative declarations of the same mineral. One
    // sourced value is enough; neither is silently set to zero.
    const hasSodium = hasNumericValue(input, 'sodiumMg');
    const hasSalt = hasNumericValue(input, 'saltG');
    if (!hasSodium && !hasSalt) {
      if (!missingFields.includes('sodiumMg')) missingFields.push('sodiumMg');
      notes.push('Neither sodium nor salt is declared. No zero value is assumed.');
    }

    if (input.addedSugarG === undefined) {
      notes.push('Added sugar is not declared. It remains unknown; total sugar is not used as a substitute.');
    }
    if (input.addedFatG === undefined) {
      notes.push('Added fat is not declared. The DGI added-fat criterion is not assessed; total fat is not used as a substitute.');
    }
    if (input.transFatG === undefined) {
      notes.push('Trans fat is not declared. No zero value is assumed; the FSSAI 2% oils/fats cap cannot be verified from the label alone.');
    }
    if (input.cholesterolMg === undefined) {
      notes.push('Cholesterol is not declared. It is reported as a label-completeness gap, not as zero.');
    }

    const completeForEvaluation = missingFields.length === 0
      && unsupportedFields.length === 0
      && basisMismatchFields.length === 0;
    let status: SourceIntegrityStatus = 'SOURCE_BACKED';
    if (unsupportedFields.length > 0 || basisMismatchFields.length > 0) status = 'UNSUPPORTED';
    else if (missingFields.length > 0) status = 'INCOMPLETE';
    else if (derivedFields.length > 0) status = 'DERIVED_SOURCE_BACKED';

    return {
      status,
      completeForEvaluation,
      unsupportedFields,
      missingFields,
      derivedFields,
      optionalMissingFields,
      basisMismatchFields,
      notes,
    };
  }

  public static assertCompleteForEvaluation(input: RawNutritionInput): SourceIntegrityReport {
    const report = this.inspect(input);
    if (!report.completeForEvaluation) throw new SourceBackedDataError(report);
    return report;
  }

  /**
   * Adds the only implicit fact this engine permits: salt equivalent from a
   * sourced sodium declaration. The result is explicitly marked DERIVED and
   * retains the source chain; callers may choose not to use this helper.
   */
  public static deriveSaltFromSodium(input: RawNutritionInput): RawNutritionInput {
    if (input.sodiumMg === undefined || input.saltG !== undefined) return input;

    const sodiumEvidence = input.nutritionEvidence?.sodiumMg;
    if (!sodiumEvidence) return input;

    const saltG = Number(((input.sodiumMg * 2.5) / 1000).toFixed(2));
    const saltEvidence: NutritionEvidence = {
      kind: 'DERIVED',
      sourceId: 'SODIUM_TO_SALT_2_5',
      sourceTitle: 'Sodium to salt equivalent conversion',
      publisher: 'Food Scanner derivation rule',
      basis: sodiumEvidence.basis,
      locator: 'formula:salt_g=sodium_mg*2.5/1000',
      formula: 'saltG = sodiumMg × 2.5 / 1000',
      inputFields: ['sodiumMg'],
    };

    const nutritionEvidence: NutritionEvidenceMap = {
      ...input.nutritionEvidence,
      saltG: saltEvidence,
    };
    return { ...input, saltG, nutritionEvidence };
  }

  public static deriveSodiumFromSalt(input: RawNutritionInput): RawNutritionInput {
    if (input.saltG === undefined || input.sodiumMg !== undefined) return input;

    const saltEvidence = input.nutritionEvidence?.saltG;
    if (!saltEvidence) return input;

    const sodiumMg = Number((input.saltG * 400).toFixed(1));
    const sodiumEvidence: NutritionEvidence = {
      kind: 'DERIVED',
      sourceId: 'SALT_TO_SODIUM_400',
      sourceTitle: 'Salt to sodium equivalent conversion',
      publisher: 'Food Scanner derivation rule',
      basis: saltEvidence.basis,
      locator: 'formula:sodium_mg=salt_g*400',
      formula: 'sodiumMg = saltG × 400',
      inputFields: ['saltG'],
    };

    const nutritionEvidence: NutritionEvidenceMap = {
      ...input.nutritionEvidence,
      sodiumMg: sodiumEvidence,
    };
    return { ...input, sodiumMg, nutritionEvidence };
  }
}
