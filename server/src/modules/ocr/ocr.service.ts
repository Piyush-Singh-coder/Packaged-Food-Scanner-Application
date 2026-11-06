import crypto from 'node:crypto';
import { db, isDatabaseAvailable } from '../../db/index.js';
import { env } from '../../config/env.js';
import { ingestionSubmissions } from '../../db/schema/ingestion.js';
import { normalizeBarcode } from '../../common/utils/barcode.js';
import { BadRequestError, ValidationError } from '../../common/errors/app-error.js';
import { NutrientVerifier } from '../engine/nutrient-verifier.js';
import { EvaluationService } from '../engine/evaluation.service.js';
import { OcrParser } from './ocr.parser.js';
import type { OcrParseInput, OcrEvaluateInput, OcrSubmitInput } from './ocr.schema.js';
import type {
  OcrParseResult,
  OcrConfirmationField,
  OcrEvaluationResponse,
  OcrSubmissionResult,
} from './ocr.types.js';
import type {
  NutritionEvidenceMap,
  NutritionField,
  RawNutritionInput,
} from '../engine/types.js';

const OCR_REQUIRED_FIELDS: NutritionField[] = [
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

export class OcrService {
  // In-memory submission store for offline and test environments
  public static memorySubmissions = new Map<string, any>();

  private static buildRawNutritionInput(extracted: ReturnType<typeof OcrParser.parse>): RawNutritionInput {
    // Defensive guard: if the parser did not establish a basis, no per-100
    // value is passed to the evaluator even if a future parser change returns
    // stray fields. The placeholder basis therefore describes an empty fact set
    // and cannot produce a grade.
    const per100: ReturnType<typeof OcrParser.parse>['per100g'] = extracted.nutritionBasis
      ? extracted.per100g
      : {};
    return {
      productName: extracted.productName || 'Unlisted Scanned Product',
      brand: extracted.brandName || 'Generic Brand',
      category: extracted.category || 'Packaged Foods',
      form: extracted.form,
      nutritionBasis: extracted.nutritionBasis ?? 'PER_100G',
      servingSizeGrams: extracted.servingSizeGrams,
      packageWeightGrams: extracted.packageWeightGrams,
      energyKcal: per100.energyKcal,
      proteinG: per100.proteinG,
      carbsG: per100.carbsG,
      totalSugarG: per100.totalSugarG,
      addedSugarG: per100.addedSugarG,
      addedFatG: undefined,
      totalFatG: per100.totalFatG,
      saturatedFatG: per100.saturatedFatG,
      transFatG: per100.transFatG,
      cholesterolMg: per100.cholesterolMg,
      sodiumMg: per100.sodiumMg,
      saltG: per100.saltG,
      fiberG: per100.fiberG,
      ingredientsText: extracted.ingredientsText,
    };
  }

  /**
   * A transcription is not independent verification. This evidence object is
   * deliberately marked TRANSCRIBED_UNVERIFIED; the evaluation engine therefore
   * withholds a grade until a reviewer attaches an artefact hash / pack photo.
   */
  private static buildUnverifiedEvidence(
    input: OcrEvaluateInput | OcrSubmitInput,
    gtin: string,
    submissionId: string
  ): NutritionEvidenceMap {
    const basis = input.nutritionBasis;
    const evidence: NutritionEvidenceMap = {};
    const fields: Array<[NutritionField, number | undefined]> = [
      ['energyKcal', input.energyKcal],
      ['proteinG', input.proteinG],
      ['carbsG', input.carbsG],
      ['totalSugarG', input.totalSugarG],
      ['addedSugarG', input.addedSugarG],
      ['addedFatG', input.addedFatG],
      ['totalFatG', input.totalFatG],
      ['saturatedFatG', input.saturatedFatG],
      ['transFatG', input.transFatG],
      ['cholesterolMg', input.cholesterolMg],
      ['sodiumMg', input.sodiumMg],
      ['saltG', input.saltG],
      ['fiberG', input.fiberG],
    ];

    for (const [field, value] of fields) {
      if (value === undefined) continue;
      evidence[field] = {
        kind: 'MANUFACTURER_LABEL',
        sourceId: `OCR_CAPTURE:${gtin}:${submissionId}`,
        sourceTitle: `Community pack transcription (${input.brandName} ${input.productName})`,
        publisher: 'Crowdsourced OCR intake',
        basis,
        locator: `ocr-transcription:${field}`,
        capturedAt: new Date().toISOString(),
        verificationStatus: 'TRANSCRIBED_UNVERIFIED',
      };
    }
    return evidence;
  }

  /**
   * 1. Ingests raw OCR packaging text, extracts label fields, and runs a
   * mathematical plausibility audit. This stage never awards a health grade.
   */
  public async parsePackagingText(input: OcrParseInput): Promise<OcrParseResult> {
    const extracted = OcrParser.parse(input.rawText);
    const rawInput = OcrService.buildRawNutritionInput(extracted);
    const normalized = NutrientVerifier.normalize(rawInput);
    let audit = NutrientVerifier.auditConsistency(normalized);

    const checklist: OcrConfirmationField[] = [];

    const missingNutritionFields = OCR_REQUIRED_FIELDS.filter(
      (field) => rawInput[field] === undefined
    );
    const hasSodiumOrSalt = rawInput.sodiumMg !== undefined || rawInput.saltG !== undefined;
    if (!hasSodiumOrSalt) missingNutritionFields.push('sodiumMg');

    if (missingNutritionFields.length > 0 && audit.overallConfidence !== 'CORRUPT') {
      audit = {
        ...audit,
        isPlausible: false,
        overallConfidence: 'SUSPECT',
        labelConsistency: {
          ...audit.labelConsistency,
          passed: false,
          notes: [
            ...audit.labelConsistency.notes,
            `Missing required nutrition fields: ${missingNutritionFields.join(', ')}`,
          ],
        },
      };
      checklist.push({
        fieldName: 'nutritionCompleteness',
        declaredValue: missingNutritionFields.join(', '),
        confidence: 'LOW_CONFIDENCE',
        warningNote:
          'OCR did not detect all graded nutrition values. Confirm the label manually; missing is not treated as zero.',
      });
    }

    const missingPackagingBasis = [
      extracted.packageWeightGrams === undefined ? 'packageWeightGrams' : null,
      extracted.servingSizeGrams === undefined ? 'servingSizeGrams' : null,
    ].filter((field): field is string => field !== null);
    if (missingPackagingBasis.length > 0 && audit.overallConfidence !== 'CORRUPT') {
      audit = {
        ...audit,
        isPlausible: false,
        overallConfidence: 'SUSPECT',
        labelConsistency: {
          ...audit.labelConsistency,
          passed: false,
          notes: [
            ...audit.labelConsistency.notes,
            `Missing packaging basis: ${missingPackagingBasis.join(', ')}`,
          ],
        },
      };
      checklist.push({
        fieldName: 'packagingBasis',
        declaredValue: missingPackagingBasis.join(', '),
        confidence: 'LOW_CONFIDENCE',
        warningNote:
          'Package or serving size was not detected; per-serving and whole-pack values cannot be derived. No default 100 g is assumed.',
      });
    }

    const atwaterEst = audit.atwaterEnergy.calculatedKcal;
    checklist.push({
      fieldName: 'energyKcal',
      declaredValue: extracted.per100g.energyKcal,
      confidence: audit.atwaterEnergy.passed ? 'HIGH' : 'SUSPECT',
      warningNote: audit.atwaterEnergy.passed
        ? undefined
        : `Declared ${extracted.per100g.energyKcal ?? 'missing'} kcal differs from calculated macronutrient sum (${atwaterEst ?? 'not calculable'} kcal).`,
      suggestedValue: atwaterEst ?? undefined,
    });

    checklist.push({
      fieldName: 'proteinG',
      declaredValue: extracted.per100g.proteinG,
      confidence: extracted.per100g.proteinG !== undefined ? 'HIGH' : 'LOW_CONFIDENCE',
      warningNote: extracted.per100g.proteinG === undefined ? 'Protein value not clearly detected.' : undefined,
    });

    const carbsVal = extracted.per100g.carbsG;
    const sugarVal = extracted.per100g.totalSugarG;
    const sugarExcess = carbsVal !== undefined && sugarVal !== undefined && sugarVal > carbsVal;

    checklist.push({
      fieldName: 'carbsG',
      declaredValue: extracted.per100g.carbsG,
      confidence: sugarExcess ? 'SUSPECT' : 'HIGH',
      warningNote: sugarExcess
        ? `Total sugars (${sugarVal!}g) exceed total carbohydrates (${carbsVal!}g).`
        : undefined,
    });

    checklist.push({
      fieldName: 'totalSugarG',
      declaredValue: extracted.per100g.totalSugarG,
      confidence: sugarExcess ? 'SUSPECT' : 'HIGH',
    });

    const addedSugarVal = extracted.per100g.addedSugarG;
    const addedSugarExcess = addedSugarVal !== undefined
      && sugarVal !== undefined
      && addedSugarVal > sugarVal;
    checklist.push({
      fieldName: 'addedSugarG',
      declaredValue: addedSugarVal,
      confidence: addedSugarVal === undefined ? 'LOW_CONFIDENCE' : addedSugarExcess ? 'SUSPECT' : 'HIGH',
      warningNote: addedSugarVal === undefined
        ? 'Added sugar was not detected; total sugar is not used as a substitute.'
        : addedSugarExcess
          ? `Added sugar (${addedSugarVal}g) exceeds total sugars (${sugarVal!}g).`
          : undefined,
    });

    const fatVal = extracted.per100g.totalFatG;
    const satFatVal = extracted.per100g.saturatedFatG;
    const satFatExcess = fatVal !== undefined && satFatVal !== undefined && satFatVal > fatVal;

    checklist.push({
      fieldName: 'totalFatG',
      declaredValue: extracted.per100g.totalFatG,
      confidence: satFatExcess ? 'SUSPECT' : 'HIGH',
      warningNote: satFatExcess
        ? `Saturated fat (${satFatVal!}g) exceeds total fat (${fatVal!}g).`
        : undefined,
    });

    checklist.push({
      fieldName: 'saturatedFatG',
      declaredValue: extracted.per100g.saturatedFatG,
      confidence: satFatExcess ? 'SUSPECT' : 'HIGH',
    });

    checklist.push({
      fieldName: 'sodiumOrSalt',
      declaredValue: extracted.per100g.sodiumMg ?? extracted.per100g.saltG,
      confidence: hasSodiumOrSalt ? 'HIGH' : 'LOW_CONFIDENCE',
      warningNote: hasSodiumOrSalt
        ? undefined
        : 'Sodium/salt was not detected in the nutrition table; ingredients are never used to invent a value.',
    });

    if (extracted.per100g.transFatG === undefined) {
      checklist.push({
        fieldName: 'transFatG',
        declaredValue: undefined,
        confidence: 'LOW_CONFIDENCE',
        warningNote: 'Trans fat was not detected; it is not assumed to be zero.',
      });
    }

    if (!audit.massConservation.passed) {
      checklist.push({
        fieldName: 'totalMacronutrients',
        declaredValue: audit.massConservation.totalMacroGramsPer100g ?? undefined,
        confidence: 'SUSPECT',
        warningNote: `Macronutrient sum (${audit.massConservation.totalMacroGramsPer100g}g/100g) physically exceeds package mass.`,
      });
    }

    const hasWarnings = checklist.some((item) => item.confidence !== 'HIGH');
    const requiresUserConfirmation = audit.overallConfidence !== 'HIGH' || hasWarnings;

    let safetyMessage = 'Packaging OCR extracted with high mathematical consistency. This is still an unverified transcription and cannot receive a graded health badge.';
    if (audit.overallConfidence === 'CORRUPT') {
      safetyMessage =
        'Critical discrepancy detected: declared values violate physical mass conservation, caloric laws, or the declared sodium/salt relationship. Please review and confirm numbers.';
    } else if (requiresUserConfirmation) {
      safetyMessage =
        'Please confirm highlighted numbers before proceeding. OCR transcription alone is not a verified pack artefact.';
    }

    return {
      barcode: input.barcode,
      extractedData: extracted,
      plausibilityAudit: audit,
      requiresUserConfirmation,
      confirmationChecklist: checklist,
      safetyMessage,
    };
  }

  /**
   * 2. Runs evaluation on confirmed OCR input. The values can be displayed,
   * but they remain TRANSCRIBED_UNVERIFIED and therefore grade-ineligible.
   */
  public async evaluateConfirmedData(input: OcrEvaluateInput): Promise<OcrEvaluationResponse> {
    const gtin = input.barcode
      ? normalizeBarcode(input.barcode).normalizedGtin13 ?? 'UNLISTED'
      : 'UNLISTED';
    const submissionId = crypto.randomUUID();
    const nutritionEvidence = OcrService.buildUnverifiedEvidence(input, gtin, submissionId);

    const rawInput: RawNutritionInput = {
      productName: input.productName,
      brand: input.brandName,
      category: input.category,
      form: input.form,
      nutritionBasis: input.nutritionBasis,
      servingSizeGrams: input.servingSizeGrams,
      packageWeightGrams: input.packageWeightGrams,
      energyKcal: input.energyKcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      totalSugarG: input.totalSugarG,
      addedSugarG: input.addedSugarG,
      addedFatG: input.addedFatG,
      totalFatG: input.totalFatG,
      saturatedFatG: input.saturatedFatG,
      transFatG: input.transFatG,
      cholesterolMg: input.cholesterolMg,
      sodiumMg: input.sodiumMg,
      saltG: input.saltG,
      fiberG: input.fiberG,
      ingredientsText: input.ingredientsText,
      nutritionEvidence,
    };

    const normalized = NutrientVerifier.normalize(rawInput);
    const audit = NutrientVerifier.auditConsistency(normalized);
    if (audit.overallConfidence === 'CORRUPT') {
      throw new ValidationError('Confirmed OCR values failed the plausibility gate', {
        atwater: audit.atwaterEnergy.reason,
        mass: audit.massConservation.reason,
        label: audit.labelConsistency.notes,
      });
    }
    const evaluation = EvaluationService.evaluate(rawInput);

    return {
      barcode: input.barcode,
      productFacts: {
        productName: input.productName,
        brand: input.brandName,
        category: input.category,
        form: input.form,
        nutritionBasis: evaluation.productFacts.nutritionBasis,
        servingSizeG: input.servingSizeGrams ?? null,
        packageWeightG: input.packageWeightGrams ?? null,
      },
      evaluation,
    };
  }

  /**
   * 3. Submits packaging data for an unlisted barcode with anti-poisoning
   * controls. Community submissions are never promoted automatically.
   */
  public async submitCrowdContribution(
    input: OcrSubmitInput,
    userId?: string
  ): Promise<OcrSubmissionResult> {
    const barcodeValidation = normalizeBarcode(input.barcode);
    if (!barcodeValidation.isValid || !barcodeValidation.normalizedGtin13) {
      throw new BadRequestError('Invalid barcode or corrupted GS1 check digit');
    }

    const gtin = barcodeValidation.normalizedGtin13;
    const submissionId = crypto.randomUUID();
    const nutritionEvidence = OcrService.buildUnverifiedEvidence(input, gtin, submissionId);

    const rawInput: RawNutritionInput = {
      productName: input.productName,
      brand: input.brandName,
      category: input.category,
      form: input.form,
      nutritionBasis: input.nutritionBasis,
      servingSizeGrams: input.servingSizeGrams,
      packageWeightGrams: input.packageWeightGrams,
      energyKcal: input.energyKcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      totalSugarG: input.totalSugarG,
      addedSugarG: input.addedSugarG,
      addedFatG: input.addedFatG,
      totalFatG: input.totalFatG,
      saturatedFatG: input.saturatedFatG,
      transFatG: input.transFatG,
      cholesterolMg: input.cholesterolMg,
      sodiumMg: input.sodiumMg,
      saltG: input.saltG,
      fiberG: input.fiberG,
      ingredientsText: input.ingredientsText,
      nutritionEvidence,
    };

    const normalized = NutrientVerifier.normalize(rawInput);
    const audit = NutrientVerifier.auditConsistency(normalized);

    // Hard gate: reject corrupt or physically impossible submissions.
    if (audit.overallConfidence === 'CORRUPT') {
      throw new ValidationError('Contribution rejected: packaging data violates physical mass or energy laws', {
        atwater: audit.atwaterEnergy.reason,
        mass: audit.massConservation.reason,
      });
    }

    const submissionRecord = {
      id: submissionId,
      barcodeGtin: gtin,
      submittedByUserId: userId || null,
      deviceId: input.deviceId || null,
      productName: input.productName,
      brandName: input.brandName,
      categorySlug: input.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      form: input.form,
      packageWeightG: String(input.packageWeightGrams),
      servingSizeG: String(input.servingSizeGrams),
      mrpInr: input.mrpInr ? String(input.mrpInr) : null,
      nutritionJson: { ...rawInput, nutritionEvidence },
      ingredientsRawText: input.ingredientsText,
      plausibilityConfidence: audit.overallConfidence,
      reviewStatus: 'PENDING_REVIEW',
      isPromotedToCatalog: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    OcrService.memorySubmissions.set(submissionId, submissionRecord);

    if (await isDatabaseAvailable()) {
      try {
        await db.insert(ingestionSubmissions).values(submissionRecord);
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    return {
      submissionId,
      barcodeGtin: gtin,
      productName: input.productName,
      brandName: input.brandName,
      status: 'PENDING_MODERATION',
      isAvailableForInstantScan: false,
      dataProvenance: 'USER_CONTRIBUTED_PENDING',
      message:
        'Product submitted for moderation. A transcription cannot be promoted without an independently reviewed pack artefact.',
    };
  }
}
