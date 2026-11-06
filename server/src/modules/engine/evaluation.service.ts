import type {
  AssessmentDescriptor,
  CompleteEvaluationOutput,
  EvaluabilityReport,
  FrequencyGrade,
  PersonaVerdict,
  RawNutritionInput,
  ScientificCitation,
  Table151CheckResult,
} from './types.js';
import { ARTIFICIAL_SWEETENERS, REFERENCE_STANDARDS } from './reference-standards.js';
import { NutrientVerifier } from './nutrient-verifier.js';
import { IngredientParser } from './ingredient-parser.js';
import { SourceBackedNutritionEngine } from './source-backed-engine.js';
import { ClaimsVerifier } from './claims-verifier.js';

type ProductClass = AssessmentDescriptor['classification'];

const BEVERAGE_PATTERN = /\b(?:beverage|drink|juice|water|soda|cola|soft\s*drink|buttermilk|lassi|coconut\s*water|energy\s*drink|tea|coffee)\b/i;
const DAIRY_BEVERAGE_PATTERN = /\b(?:milk|milkshake|dairy\s*drink|smoothie)\b/i;
const CONDIMENT_PATTERN = /\b(?:sauce|ketchup|condiment|chutney|dressing|mayonnaise|jam|jelly|pickle|preserve)\b/i;
const OIL_FAT_PATTERN = /\b(?:oil|ghee|butter|vanaspati|margarine|fat\s*spread)\b/i;
const FAT_MATERIAL_CATEGORIES = /\b(?:biscuit|cookie|cracker|rusk|namkeen|bhujia|instant\s*noodle|noodle|pasta|snack|chip|crisp|wafer|bakery|cake|pastry|muffin|doughnut|donut|confectionery|chocolate|fried|sev)\b/i;

function classifyProduct(raw: RawNutritionInput): ProductClass {
  if (BEVERAGE_PATTERN.test(raw.category)) return 'BEVERAGE';
  if (CONDIMENT_PATTERN.test(raw.category)) return 'CONDIMENT';
  if (OIL_FAT_PATTERN.test(raw.category)) return 'OIL_FAT';
  // Milk is a beverage only when the declared form is liquid. This avoids
  // classifying paneer, milk powder, or milk chocolate as a soft drink.
  if (raw.form === 'LIQUID' && DAIRY_BEVERAGE_PATTERN.test(raw.category)) return 'BEVERAGE';
  return raw.form === 'LIQUID' ? 'LIQUID_FOOD' : 'SOLID_FOOD';
}

function percent(value: number | null, denominator: number): number | null {
  if (value === null || !Number.isFinite(value) || denominator <= 0) return null;
  return Number(((value / denominator) * 100).toFixed(1));
}

function insufficientVerdict(
  personaId: PersonaVerdict['personaId'],
  personaName: string,
  reason: string,
  citation: string
): PersonaVerdict {
  return {
    personaId,
    personaName,
    status: 'INSUFFICIENT_DATA',
    headline: 'Not enough verified data for a personal verdict',
    reason,
    citation,
  };
}

export class EvaluationService {
  /**
   * Evaluates declared product nutrition against the DGI 2024 Table 15.1
   * advisory screen and family label-reading lenses.
   *
   * Fail-closed rules:
   * - no source-backed complete label => no grade and no green verdict;
   * - missing is null, never zero;
   * - added fat is not an Indian mandatory label field and is not invented;
   * - trans fat is not compared with an invented 0.2 g cutoff;
   * - beverages use liquid thresholds; ketchup/sauces use the declared per-100
   *   g basis rather than being misclassified as soft drinks.
   */
  public static evaluate(
    rawInput: RawNutritionInput,
    frontOfPackText: string = rawInput.frontOfPackText || ''
  ): CompleteEvaluationOutput {
    const normalized = NutrientVerifier.normalize(rawInput);
    const consistencyAudit = NutrientVerifier.auditConsistency(normalized, {
      productName: rawInput.productName,
      category: rawInput.category,
      isGenericFood: rawInput.nutritionContext === 'GENERIC_FOOD',
    });
    const sourceIntegrity = SourceBackedNutritionEngine.inspect(rawInput);

    const per100 = normalized.per100g;
    const serving = normalized.perServing;
    const classification = classifyProduct(rawInput);
    const basis = normalized.basis;

    const servingSize = serving.servingSizeGrams;
    const packWeight = rawInput.packageWeightGrams !== undefined
      && Number.isFinite(rawInput.packageWeightGrams)
      && rawInput.packageWeightGrams > 0
      ? rawInput.packageWeightGrams
      : null;
    const packMultiplier = servingSize !== null && packWeight !== null
      ? Number((packWeight / servingSize).toFixed(1))
      : null;

    const thresholds = classification === 'BEVERAGE'
      ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID
      : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID;
    const citation: ScientificCitation = thresholds.citation;

    const saltMgPer100 = per100.saltG !== null
      ? Number((per100.saltG * 1000).toFixed(0))
      : per100.sodiumMg !== null
        ? Number((per100.sodiumMg * 2.5).toFixed(0))
        : null;
    const saturatedFatEnergyPercent = per100.saturatedFatG !== null && per100.energyKcal !== null && per100.energyKcal > 0
      ? Number(((per100.saturatedFatG * 9 / per100.energyKcal) * 100).toFixed(1))
      : null;

    const table151HfssChecks: Table151CheckResult[] = [
      {
        nutrient: 'Energy',
        unit: 'kcal',
        productValuePer100: per100.energyKcal,
        cutoffPer100: classification === 'BEVERAGE'
          ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.ENERGY_KCAL_PER_100ML
          : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.ENERGY_KCAL_PER_100G,
        isBreached: per100.energyKcal !== null
          ? per100.energyKcal > (classification === 'BEVERAGE'
            ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.ENERGY_KCAL_PER_100ML
            : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.ENERGY_KCAL_PER_100G)
          : null,
        citation,
      },
      {
        nutrient: 'Added Sugar',
        unit: 'g',
        productValuePer100: per100.addedSugarG,
        cutoffPer100: classification === 'BEVERAGE'
          ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.ADDED_SUGAR_G_PER_100ML
          : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.ADDED_SUGAR_G_PER_100G,
        isBreached: per100.addedSugarG !== null
          ? per100.addedSugarG > (classification === 'BEVERAGE'
            ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.ADDED_SUGAR_G_PER_100ML
            : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.ADDED_SUGAR_G_PER_100G)
          : null,
        citation,
      },
      {
        nutrient: 'Added Fat',
        unit: 'g',
        productValuePer100: per100.addedFatG,
        cutoffPer100: classification === 'BEVERAGE'
          ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.ADDED_FAT_G_PER_100ML
          : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.ADDED_FAT_G_PER_100G,
        isBreached: per100.addedFatG === null
          ? null
          : per100.addedFatG > (classification === 'BEVERAGE'
            ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.ADDED_FAT_G_PER_100ML
            : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.ADDED_FAT_G_PER_100G),
        note: per100.addedFatG === null
          ? 'Added fat is not declared on Indian label; that DGI Table 15.1 criterion is not assessed. Total fat or saturated fat is not substituted.'
          : undefined,
        citation,
      },
      {
        nutrient: 'Salt',
        unit: 'mg',
        productValuePer100: saltMgPer100,
        cutoffPer100: classification === 'BEVERAGE'
          ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.SALT_MG_PER_100ML
          : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.SALT_MG_PER_100G,
        isBreached: saltMgPer100 !== null
          ? saltMgPer100 > (classification === 'BEVERAGE'
            ? REFERENCE_STANDARDS.TABLE_15_1_HFSS.LIQUID.SALT_MG_PER_100ML
            : REFERENCE_STANDARDS.TABLE_15_1_HFSS.SOLID.SALT_MG_PER_100G)
          : null,
        citation,
      },
      {
        nutrient: 'Saturated Fat',
        unit: '% energy',
        productValuePer100: saturatedFatEnergyPercent,
        cutoffPer100: REFERENCE_STANDARDS.ICMR_NIN_2024_ADULT_DAILY.SATURATED_FAT_ENERGY_PERCENT,
        isBreached: saturatedFatEnergyPercent !== null
          ? saturatedFatEnergyPercent > REFERENCE_STANDARDS.ICMR_NIN_2024_ADULT_DAILY.SATURATED_FAT_ENERGY_PERCENT
          : null,
        note: 'DGI 2024 treats saturated fat above 5% of energy as high. This is a daily guidance benchmark, not a product-specific clinical limit.',
        citation: REFERENCE_STANDARDS.ICMR_NIN_2024_ADULT_DAILY.citation,
      },
    ];

    const claimsAudit = ClaimsVerifier.verifyClaims(rawInput, normalized, frontOfPackText);
    const claimStrings = claimsAudit.assessedClaims.map((c) => c.claim);
    const ingredientsAnalysis = IngredientParser.parse(
      rawInput.ingredientsText,
      rawInput.productName,
      claimStrings
    );
    const dailyAdult = REFERENCE_STANDARDS.ICMR_NIN_2024_ADULT_DAILY;

    const sodiumPercentDv = serving.sodiumMg !== null
      ? percent(serving.sodiumMg, dailyAdult.SODIUM_UPPER_LIMIT_MG)
      : null;
    const sugarPercentDv = serving.addedSugarG !== null
      ? percent(serving.addedSugarG, dailyAdult.ADDED_SUGAR_CEILING_G)
      : null;

    const sugarTeaspoonsPer100 = per100.addedSugarG !== null
      ? Number((per100.addedSugarG / 4.0).toFixed(1))
      : null;
    const sugarTeaspoonsPerServing = serving.addedSugarG !== null
      ? Number((serving.addedSugarG / 4.0).toFixed(1))
      : null;
    const sugarTeaspoonsWholePack = per100.addedSugarG !== null && packWeight !== null
      ? Number(((per100.addedSugarG * (packWeight / 100.0)) / 4.0).toFixed(1))
      : null;

    const saltGramsPer100 = per100.saltG !== null
      ? Number(per100.saltG.toFixed(2))
      : per100.sodiumMg !== null
        ? Number(((per100.sodiumMg * 2.5) / 1000.0).toFixed(2))
        : null;
    const saltGramsPerServing = serving.saltG !== null
      ? Number(serving.saltG.toFixed(2))
      : serving.sodiumMg !== null
        ? Number(((serving.sodiumMg * 2.5) / 1000.0).toFixed(2))
        : null;
    const saltGramsWholePack = saltGramsPer100 !== null && packWeight !== null
      ? Number((saltGramsPer100 * (packWeight / 100.0)).toFixed(2))
      : null;

    const breachedCount = table151HfssChecks.filter((item) => item.isBreached === true).length;
    const assessedCount = table151HfssChecks.filter((item) => item.isBreached !== null).length;
    const hasBasisMismatch = sourceIntegrity.basisMismatchFields.length > 0;
    const hasCorruptConsistency = consistencyAudit.overallConfidence === 'CORRUPT';
    const isGraded = sourceIntegrity.completeForEvaluation
      && !hasBasisMismatch
      && !hasCorruptConsistency
      && assessedCount >= 3;

    let frequencyGrade: FrequencyGrade = 'NOT_EVALUABLE';
    let badgeLabel = '⚪ NOT ENOUGH VERIFIED DATA TO GRADE';
    const whySummary: string[] = [];

    if (sourceIntegrity.completeForEvaluation && !hasBasisMismatch && !hasCorruptConsistency) {
      if (!isGraded) {
        whySummary.push('Too few assessed nutrients were available to apply the DGI Table 15.1 screen.');
      } else if (breachedCount >= 2) {
        frequencyGrade = 'BEST_KEPT_OCCASIONAL';
        badgeLabel = `🔴 HIGH IN ${breachedCount} ASSESSED NUTRIENT${breachedCount > 1 ? 'S' : ''}`;
        table151HfssChecks
          .filter((item) => item.isBreached === true)
          .forEach((item) => whySummary.push(`Exceeds the DGI 2024 Table 15.1 reference for ${item.nutrient}.`));
      } else if (breachedCount === 1) {
        frequencyGrade = 'ENJOY_IN_MODERATION';
        badgeLabel = '🟡 MODERATE IN 1 ASSESSED NUTRIENT';
        const breached = table151HfssChecks.find((item) => item.isBreached === true);
        if (breached) whySummary.push(`Exceeds the DGI 2024 Table 15.1 reference for ${breached.nutrient}.`);
      } else {
        const isFatMaterial = classification === 'SOLID_FOOD' && (
          FAT_MATERIAL_CATEGORIES.test(rawInput.category || '') ||
          FAT_MATERIAL_CATEGORIES.test(rawInput.productName || '')
        );
        const totalFat = per100.totalFatG ?? 0;
        const isAddedFatMissing = per100.addedFatG === null;

        if (isFatMaterial && isAddedFatMissing && totalFat > 15.0) {
          frequencyGrade = 'ENJOY_IN_MODERATION';
          badgeLabel = '🟡 PARTIAL ASSESSMENT — ADDED FAT NOT DECLARED';
          whySummary.push(
            `Total fat is high (${totalFat}g/100g) but added fat is not separately declared. Under ICMR-NIN guidelines, products in this category typically contain high added fat. Rating capped at moderate pending complete fat declaration.`
          );
        } else {
          frequencyGrade = 'SUITABLE_FOR_REGULAR_USE';
          badgeLabel = '🟢 NO ASSESSED DGI THRESHOLD EXCEEDED';
          whySummary.push(
            'No assessed DGI Table 15.1 threshold was exceeded for energy, added sugar, salt, saturated fat (% energy), or added fat when declared.'
          );
        }
      }
    } else {
      const missing = sourceIntegrity.missingFields.length > 0
        ? `Missing: ${sourceIntegrity.missingFields.join(', ')}.`
        : '';
      const unverified = sourceIntegrity.unsupportedFields.length > 0
        ? `No verified source: ${sourceIntegrity.unsupportedFields.join(', ')}.`
        : '';
      const incompleteReason = [missing, unverified].filter(Boolean).join(' ');
      if (incompleteReason) whySummary.push(incompleteReason);
      if (hasBasisMismatch) {
        whySummary.push(
          `Basis mismatch on: ${sourceIntegrity.basisMismatchFields.join(', ')}. Per-100 g, per-100 ml, and per-serving evidence are not silently converted.`
        );
      }
      if (hasCorruptConsistency) {
        whySummary.push(
          'The technical consistency audit found a corrupt or physically impossible label (for example, a mass total above 100 g per 100 g, a large energy discrepancy, or contradictory sodium/salt values). No grade is issued.'
        );
      }
      if (!incompleteReason && !hasBasisMismatch && !hasCorruptConsistency) {
        whySummary.push('The label is not complete enough for a graded assessment.');
      }
      whySummary.push('No green, amber, or orange health badge is shown for unverified, inconsistent, or incomplete label data.');
    }

    if (sourceIntegrity.completeForEvaluation && per100.addedFatG === null) {
      whySummary.push('Added fat was not declared; that DGI criterion is not assessed. Total fat is not substituted for added fat.');
    }
    if (isGraded && consistencyAudit.overallConfidence === 'SUSPECT') {
      whySummary.push(
        'Technical consistency warning: this label passed the evidence gates but has an implausible or contradictory arithmetic check. The warning is not silently repaired.'
      );
    }
    if (sourceIntegrity.completeForEvaluation && per100.transFatG === null) {
      whySummary.push('Trans fat was not declared; it is not assumed to be zero, and the FSSAI 2% oils/fats cap cannot be verified from the label alone.');
    }
    if (sodiumPercentDv !== null && sodiumPercentDv >= 20) {
      whySummary.push(
        `One serving supplies ${sodiumPercentDv}% of the DGI 2,000 mg daily sodium reference. This is a daily-reference share, not a CSI per-snack cutoff.`
      );
    }
    if (sugarPercentDv !== null && sugarPercentDv >= 20) {
      whySummary.push(
        `One serving supplies ${sugarPercentDv}% of the 25 g daily added-sugar reference used for a 2,000 kcal adult diet.`
      );
    }

    const evaluability: EvaluabilityReport = {
      status: hasBasisMismatch
        ? 'BASIS_MISMATCH'
        : hasCorruptConsistency
          ? 'NOT_EVALUABLE'
          : sourceIntegrity.completeForEvaluation
            ? 'EVALUABLE'
            : sourceIntegrity.unsupportedFields.length > 0
              ? 'SOURCE_UNVERIFIED'
              : 'LABEL_INCOMPLETE',
      canShowGrade: isGraded,
      provenancePolicy: isGraded ? 'VERIFIED_PACK_GRADED' : 'PROVISIONAL_UNGRADED',
      missingFields: sourceIntegrity.missingFields,
      unverifiedFields: sourceIntegrity.unsupportedFields,
      optionalMissingFields: sourceIntegrity.optionalMissingFields,
      notes: sourceIntegrity.notes,
    };

    const assessment: AssessmentDescriptor = {
      rubricId: 'DGI_2024_TABLE_15_1_DECLARED_NUTRIENTS',
      classification,
      basis,
      standardsUsed: [
        'ICMR-NIN Dietary Guidelines for Indians 2024, Table 15.1',
        'ICMR-NIN Dietary Guidelines for Indians 2024, daily references',
        'FSSAI Labelling and Display Regulations 2020 (%RDA context only)',
      ],
      limitations: [
        isGraded
          ? 'The grade is a declared-nutrient screen against advisory DGI thresholds, not a medical certification or a complete diet assessment.'
          : 'A grade is withheld because the label is incomplete, inconsistent, or lacks verified source artefacts.',
        per100.addedFatG === null
          ? 'Added fat is not a mandatory Indian label field and was not assessed.'
          : 'Added fat was declared and assessed against the DGI Table 15.1 reference.',
        per100.transFatG === null
          ? 'Trans fat was not declared; no zero value was assumed and the oils/fats cap was not applied to the finished product.'
          : 'Declared trans fat is displayed but the FSSAI 2% cap applies to oils/fats, not directly to a finished product label.',
        hasBasisMismatch
          ? 'One or more values were declared on a different basis from their evidence; the engine did not convert or grade them.'
          : hasCorruptConsistency
            ? 'The technical consistency audit failed; no health grade is issued from corrupt data.'
            : PER_100_BASIS_NOTE[basis],
      ],
    };

    const familyVerdicts: PersonaVerdict[] = [];
    const insufficientReason = 'The product label is missing verified values or evidence needed for a personal lens.';
    const diabeticRules = REFERENCE_STANDARDS.CLINICAL_LENSES.DIABETIC;
    const infantRules = REFERENCE_STANDARDS.CLINICAL_LENSES.INFANT_UNDER_2;
    const childRules = REFERENCE_STANDARDS.CLINICAL_LENSES.CHILD_OVER_2;
    const cardiacRules = REFERENCE_STANDARDS.CLINICAL_LENSES.CARDIAC;
    const renalRules = REFERENCE_STANDARDS.CLINICAL_LENSES.RENAL;

    const hasHighGiMarker = ingredientsAnalysis.decoded.some((item) => item.category === 'HIGH_GI_CARB');
    const hasAddedSugarMarker = ingredientsAnalysis.decoded.some((item) => item.category === 'ADDED_SUGAR');
    const hasNssSweetener = ingredientsAnalysis.decoded.some((item) =>
      item.insCode !== undefined && ARTIFICIAL_SWEETENERS[item.insCode] !== undefined
    );
    const containsPotassiumChloride = ingredientsAnalysis.decoded.some(
      (item) => item.insCode?.toLowerCase() === '508'
    );
    const containsMsg = ingredientsAnalysis.decoded.some(
      (item) => item.insCode?.toLowerCase() === '621' || /monosodium\s+glutamate|\bmsg\b/i.test(item.rawToken)
    );

    // Adult: a transparent population-level screen, not a clinical verdict.
    if (!isGraded) {
      familyVerdicts.push(insufficientVerdict(
        'ADULT',
        'General Adult (2,000 kcal reference diet)',
        insufficientReason,
        dailyAdult.citation.guidelineName
      ));
    } else {
      const adultStatus = frequencyGrade === 'SUITABLE_FOR_REGULAR_USE'
        ? 'GREEN_SUITABLE'
        : 'YELLOW_MODERATE';
      familyVerdicts.push({
        personaId: 'ADULT',
        personaName: 'General Adult (2,000 kcal reference diet)',
        status: adultStatus,
        headline: frequencyGrade === 'SUITABLE_FOR_REGULAR_USE'
          ? 'No assessed DGI threshold exceeded'
          : 'Assessed nutrient exceeds a DGI reference',
        reason: sodiumPercentDv !== null && sugarPercentDv !== null
          ? `One serving provides ${sodiumPercentDv}% of the DGI sodium reference and ${sugarPercentDv}% of the 25 g added-sugar reference. The screen is advisory and not a complete diet assessment.`
          : `The label does not declare a serving size, so daily-reference shares cannot be calculated. The per-100 g screen is advisory and not a complete diet assessment.`,
        citation: dailyAdult.citation.guidelineName,
      });
    }

    // Diabetic: no invented 4 g/serving ceiling.
    if (!isGraded) {
      familyVerdicts.push(insufficientVerdict(
        'DIABETIC',
        'Diabetic / Pre-Diabetic',
        insufficientReason,
        diabeticRules.citation.guidelineName
      ));
    } else if (per100.addedSugarG !== null && per100.addedSugarG > 0) {
      familyVerdicts.push({
        personaId: 'DIABETIC',
        personaName: 'Diabetic / Pre-Diabetic',
        status: 'YELLOW_MODERATE',
        headline: 'Contains added sugar',
        reason: serving.addedSugarG !== null
          ? `One serving contains ${serving.addedSugarG}g added sugar (${per100.addedSugarG}g/100g). Rapid carbohydrate absorption is anticipated. RSSDI 2022 provides no 4 g-per-serving numeric ceiling; this is a caution to consider total carbohydrate and portion size, not an individualized glycemic prediction.`
          : `The label declares ${per100.addedSugarG}g added sugar per 100g, but no serving size. Rapid carbohydrate absorption is anticipated. RSSDI 2022 provides no 4 g-per-serving numeric ceiling; this is a caution, not an individualized glycemic prediction.`,
        citation: diabeticRules.citation.guidelineName,
      });
    } else if (hasHighGiMarker) {
      familyVerdicts.push({
        personaId: 'DIABETIC',
        personaName: 'Diabetic / Pre-Diabetic',
        status: 'YELLOW_MODERATE',
        headline: 'Refined carbohydrate markers present',
        reason: 'The ingredient list contains refined carbohydrate markers. High-glycemic-index carbohydrates may contribute to postprandial glucose elevation; this is an ingredient screen, not an individualized clinical prediction.',
        citation: diabeticRules.citation.guidelineName,
      });
    } else {
      familyVerdicts.push({
        personaId: 'DIABETIC',
        personaName: 'Diabetic / Pre-Diabetic',
        status: 'GREEN_SUITABLE',
        headline: 'No added sugar or refined-carb marker decoded',
        reason: 'No added sugar or refined-carbohydrate marker was decoded from the declared label. This is not a glycemic-index measurement or diabetes-suitability certification.',
        citation: diabeticRules.citation.guidelineName,
      });
    }

    // Infant under 2: only the added-sugar rule is applied.
    if (!isGraded) {
      familyVerdicts.push(insufficientVerdict(
        'INFANT_UNDER_2',
        'Infant / Toddler (Under 2 Years)',
        insufficientReason,
        infantRules.citation.guidelineName
      ));
    } else if (per100.addedSugarG !== null && per100.addedSugarG > 0) {
      familyVerdicts.push({
        personaId: 'INFANT_UNDER_2',
        personaName: 'Infant / Toddler (Under 2 Years)',
        status: 'RED_LIMIT_AVOID',
        headline: 'Contains added sugar',
        reason: serving.addedSugarG !== null
          ? `One serving contains ${serving.addedSugarG}g added sugar (${per100.addedSugarG}g/100g). ICMR-NIN DGI 2024 advises no added sugar for children under 2 years.`
          : `The label declares ${per100.addedSugarG}g added sugar per 100g and no serving size. ICMR-NIN DGI 2024 advises no added sugar for children under 2 years.`,
        citation: infantRules.citation.guidelineName,
      });
    } else if (containsMsg) {
      familyVerdicts.push({
        personaId: 'INFANT_UNDER_2',
        personaName: 'Infant / Toddler (Under 2 Years)',
        status: 'RED_LIMIT_AVOID',
        headline: 'Contains Monosodium Glutamate (INS 621)',
        reason: 'FSSAI (Labelling and Display) Regulations 2020, Schedule II mandates the warning: NOT RECOMMENDED FOR INFANTS BELOW 12 MONTHS AND PREGNANT WOMEN.',
        citation: 'FSSAI (Labelling and Display) Regulations, 2020, Schedule II',
      });
    } else if (hasAddedSugarMarker) {
      familyVerdicts.push({
        personaId: 'INFANT_UNDER_2',
        personaName: 'Infant / Toddler (Under 2 Years)',
        status: 'YELLOW_MODERATE',
        headline: 'Sweetener marker contradicts zero declaration',
        reason: 'The nutrition line declares zero added sugar, but the ingredient list contains a sweetener marker. Verify the pack; this is not an infant-food certification.',
        citation: infantRules.citation.guidelineName,
      });
    } else {
      familyVerdicts.push({
        personaId: 'INFANT_UNDER_2',
        personaName: 'Infant / Toddler (Under 2 Years)',
        status: 'GREEN_SUITABLE',
        headline: 'No added sugar declared',
        reason: 'No added sugar was declared. Only the added-sugar criterion is assessed here; this is not a general infant-suitability or medical certification.',
        citation: infantRules.citation.guidelineName,
      });
    }

    // Child 2+: no invented child-specific gram ceiling; use the WHO conditional NSS wording.
    if (!isGraded) {
      familyVerdicts.push(insufficientVerdict(
        'CHILD_OVER_2',
        'Child (Age 2+)',
        insufficientReason,
        childRules.citation.guidelineName
      ));
    } else if (hasNssSweetener) {
      familyVerdicts.push({
        personaId: 'CHILD_OVER_2',
        personaName: 'Child (Age 2+)',
        status: 'YELLOW_MODERATE',
        headline: 'Contains a non-sugar sweetener',
        reason: 'WHO 2023 makes a conditional recommendation about non-sugar sweeteners and notes that guidance for children is not available. This is not a pediatric ban or a medical verdict.',
        citation: childRules.citation.guidelineName,
      });
    } else if (per100.addedSugarG !== null && per100.addedSugarG > 0) {
      familyVerdicts.push({
        personaId: 'CHILD_OVER_2',
        personaName: 'Child (Age 2+)',
        status: 'YELLOW_MODERATE',
        headline: 'Contains added sugar',
        reason: serving.addedSugarG !== null
          ? `One serving contains ${serving.addedSugarG}g added sugar (${per100.addedSugarG}g/100g). No child-specific gram ceiling is asserted; choose a smaller portion or a less frequent treat and consider the rest of the day's diet.`
          : `The label declares ${per100.addedSugarG}g added sugar per 100g and no serving size. No child-specific gram ceiling is asserted; choose a smaller portion or a less frequent treat and consider the rest of the day's diet.`,
        citation: childRules.citation.guidelineName,
      });
    } else {
      familyVerdicts.push({
        personaId: 'CHILD_OVER_2',
        personaName: 'Child (Age 2+)',
        status: 'GREEN_SUITABLE',
        headline: 'No added sugar or NSS decoded',
        reason: 'No added sugar or non-sugar sweetener was decoded from this label. This is not a complete child-nutrition assessment.',
        citation: childRules.citation.guidelineName,
      });
    }

    // Cardiac / hypertension: use a transparent 20% share of the DGI daily sodium reference.
    if (!isGraded) {
      familyVerdicts.push(insufficientVerdict(
        'CARDIAC',
        'Hypertension / Heart Health',
        insufficientReason,
        cardiacRules.citation.guidelineName
      ));
    } else if (serving.sodiumMg === null) {
      familyVerdicts.push({
        personaId: 'CARDIAC',
        personaName: 'Hypertension / Heart Health',
        status: 'YELLOW_MODERATE',
        headline: 'Serving size not declared',
        reason: 'The label has a sodium value but no serving size, so a single-serving sodium share cannot be calculated. The per-100 value is shown without a cardiac suitability claim.',
        citation: cardiacRules.citation.guidelineName,
      });
    } else {
      const sodiumShare = percent(serving.sodiumMg, dailyAdult.SODIUM_UPPER_LIMIT_MG);
      const highSodiumShare = serving.sodiumMg > cardiacRules.SINGLE_SERVING_SODIUM_REFERENCE_MG;
      const highSatFat = saturatedFatEnergyPercent !== null
        && saturatedFatEnergyPercent > dailyAdult.SATURATED_FAT_ENERGY_PERCENT;
      const cardiacStatus = highSodiumShare || highSatFat ? 'YELLOW_MODERATE' : 'GREEN_SUITABLE';
      const saturatedFatShareText = saturatedFatEnergyPercent !== null
        ? `${saturatedFatEnergyPercent}% of declared energy`
        : 'not calculable from the declared label';
      familyVerdicts.push({
        personaId: 'CARDIAC',
        personaName: 'Hypertension / Heart Health',
        status: cardiacStatus,
        headline: highSodiumShare || highSatFat ? 'Higher sodium or saturated-fat share' : 'Lower assessed sodium and saturated-fat share',
        reason: `One serving provides ${serving.sodiumMg}mg sodium (${sodiumShare}% of the DGI 2,000mg daily reference); saturated fat is ${saturatedFatShareText}. The 400mg prompt is 20% of a daily reference, not a CSI per-snack cutoff.`,
        citation: cardiacRules.citation.guidelineName,
      });
    }

    // Renal: never green merely because INS 508 is absent.
    if (!isGraded) {
      familyVerdicts.push(insufficientVerdict(
        'RENAL',
        'Kidney / Renal Health',
        insufficientReason,
        renalRules.citation.guidelineName
      ));
    } else {
      familyVerdicts.push({
        personaId: 'RENAL',
        personaName: 'Kidney / Renal Health',
        status: containsPotassiumChloride ? 'RED_LIMIT_AVOID' : 'YELLOW_MODERATE',
        headline: containsPotassiumChloride ? 'Potassium-chloride salt substitute detected' : 'Renal suitability cannot be certified from a label',
        reason: containsPotassiumChloride
          ? 'Contains INS 508 (potassium chloride), which may be unsuitable for some people with kidney disease. Consult a healthcare professional.'
          : 'No INS 508 was decoded, but absence of one additive does not establish renal safety. Packaged food labels in India are not required to declare potassium or phosphorus; data is insufficient for clinical renal evaluation. Consult a healthcare professional.',
        citation: renalRules.citation.guidelineName,
      });
    }

    const practicalTip = 'Compare the per-100 g or per-100 ml values with other products in the same aisle, and use the declared serving size rather than the whole pack.';
    const betterAlternativesSuggestion = 'Use the swap endpoint to compare verified products in the same category; an unverified product is never ranked as a healthier alternative.';

    for (const alert of claimsAudit.summary) {
      if (alert.startsWith('⚠️')) {
        whySummary.push(alert);
      }
    }
    for (const alert of ingredientsAnalysis.quidAudit.summary) {
      if (alert.startsWith('⚠️') && !whySummary.includes(alert)) {
        whySummary.push(alert);
      }
    }
    for (const warn of ingredientsAnalysis.statutoryWarningsTriggered) {
      const wText = `Statutory Warning: ${warn.mandatoryDeclaration}`;
      if (!whySummary.includes(wText)) {
        whySummary.push(wText);
      }
    }
    if (ingredientsAnalysis.processingClassificationSummary.isUltraProcessed) {
      whySummary.push(
        `Contains ${ingredientsAnalysis.processingClassificationSummary.groupCCount} ultra-processed food marker(s) / cosmetic additive(s) (ICMR-NIN 2024 Table 15.2 Group C).`
      );
    }

    return {
      productFacts: {
        productName: rawInput.productName,
        brand: rawInput.brand,
        category: rawInput.category,
        form: rawInput.form,
        nutritionBasis: basis,
        servingSizeG: servingSize,
        packageWeightG: packWeight,
        packMultiplier,
      },
      consistencyAudit,
      sourceIntegrity,
      evaluability,
      assessment,
      claimsAudit,
      quidAudit: ingredientsAnalysis.quidAudit,
      statutoryWarnings: ingredientsAnalysis.statutoryWarningsTriggered,
      processingClassificationSummary: ingredientsAnalysis.processingClassificationSummary,
      normalizedNutrition: normalized,
      table151HfssChecks,
      frequencyGrade,
      isGraded,
      badgeLabel,
      whySummary,
      visualizers: {
        sugarTeaspoonsPer100,
        sugarTeaspoonsPerServing,
        sugarTeaspoonsWholePack,
        saltGramsPer100,
        saltGramsPerServing,
        saltGramsWholePack,
        sodiumPercentDvPerServing: sodiumPercentDv,
        addedSugarPercentDvPerServing: sugarPercentDv,
      },
      ingredientsAnalysis,
      familyVerdicts,
      practicalTip,
      betterAlternativesSuggestion,
    };
  }
}

const PER_100_BASIS_NOTE: Record<'PER_100G' | 'PER_100ML', string> = {
  PER_100G: 'Declared values are assessed per 100 g. The DGI solid-food reference is used for non-beverages, including sauces declared per 100 g.',
  PER_100ML: 'Declared values are assessed per 100 ml. The DGI beverage reference is used only for beverages; other liquid foods are not treated as soft drinks.',
};
