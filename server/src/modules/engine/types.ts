export type FoodForm = 'SOLID' | 'LIQUID';

export type DeclaredValueSource = 'DECLARED' | 'NOT_DECLARED';

/**
 * A nutrition number is only trusted when its origin is explicit. A
 * manufacturer label is appropriate for a packaged product; IFCT/ICMR or a
 * peer-reviewed table is appropriate for a generic food; DERIVED is reserved
 * for arithmetic whose inputs are already evidenced.
 */
export type NutritionEvidenceKind =
  | 'MANUFACTURER_LABEL'
  | 'OFFICIAL_RESEARCH_TABLE'
  | 'PEER_REVIEWED_RESEARCH'
  | 'DERIVED';

export type NutritionBasis = 'PER_100G' | 'PER_100ML' | 'PER_SERVING' | 'WHOLE_PACK';

export type NutritionDeclarationBasis = 'PER_100G' | 'PER_100ML';

export type NutritionField =
  | 'energyKcal'
  | 'proteinG'
  | 'carbsG'
  | 'totalSugarG'
  | 'addedSugarG'
  | 'addedFatG'
  | 'totalFatG'
  | 'saturatedFatG'
  | 'transFatG'
  | 'cholesterolMg'
  | 'sodiumMg'
  | 'saltG'
  | 'fiberG'
  | 'polyolsG';

export type RegulatoryStatus =
  | 'FSSAI_GAZETTED_MANDATORY'
  | 'FSSAI_DRAFT_PROPOSAL'
  | 'ICMR_NIN_GUIDELINE'
  | 'IFCT_2017_COMPOSITION'
  | 'WHO_CODEX_STANDARD';

export interface AuthorityCitation {
  sourceId: string;
  authority: 'FSSAI' | 'ICMR-NIN' | 'WHO' | 'CODEX';
  documentTitle: string;
  clauseOrTable: string;
  versionOrYear: string;
  status: RegulatoryStatus;
  officialUrl: string;
}

export interface AuthoritySourcedValue<T> {
  value: T;
  unit: 'g/100g' | 'g/100ml' | 'mg/100g' | 'kcal/100g' | '%RDA' | 'g/day' | 'mg/day' | 'kcal/g' | 'mg/L' | '%';
  citation: AuthorityCitation;
}

export type FunctionalClass =
  | 'ACIDITY_REGULATOR'
  | 'ANTICAKING_AGENT'
  | 'ANTIOXIDANT'
  | 'COLOUR'
  | 'COLOUR_RETENTION_AGENT'
  | 'EMULSIFIER'
  | 'EMULSIFYING_SALT'
  | 'FIRMING_AGENT'
  | 'FLAVOUR_ENHANCER'
  | 'FLOUR_TREATMENT_AGENT'
  | 'FOAMING_AGENT'
  | 'GELLING_AGENT'
  | 'GLAZING_AGENT'
  | 'HUMECTANT'
  | 'PRESERVATIVE'
  | 'PROPELLANT'
  | 'RAISING_AGENT'
  | 'SEQUESTRANT'
  | 'STABILIZER'
  | 'SWEETENER'
  | 'THICKENER'
  | 'NATURAL_BASE_INGREDIENT';

export type ProcessingClassification =
  | 'GROUP_A_MINIMALLY_PROCESSED'   // ICMR-NIN 2024 Table 15.2 / NOVA 1
  | 'GROUP_B_CULINARY_INGREDIENT'   // ICMR-NIN 2024 Table 15.2 / NOVA 2
  | 'GROUP_C_ULTRA_PROCESSED';      // Cosmetic additives, industrial UPF markers

export interface StatutoryWarningTrigger {
  ruleId: string;
  substance: string;
  mandatoryDeclaration: string;
  regulatoryReference: string;
  isTriggered: boolean;
}

export interface QuidAuditResult {
  hasEmphasizedIngredients: boolean;
  emphasizedIngredients: string[];
  compliantDeclarations: Array<{ ingredient: string; percentage: number }>;
  nonCompliantDeclarations: Array<{ ingredient: string; reason: string }>;
  compoundIngredients: Array<{
    name: string;
    percentage?: number;
    hasSubList: boolean;
    isCompliant: boolean;
    reason?: string;
  }>;
  summary: string[];
}

export interface NutritionEvidence {
  kind: NutritionEvidenceKind;
  sourceId: string;
  sourceTitle: string;
  publisher: string;
  basis: NutritionBasis;
  locator: string;
  sourceUrl?: string;
  capturedAt?: string;
  /** SHA-256 of the reviewed image, PDF page, or signed label artefact. */
  artifactHash?: string;
  /** Required when kind is DERIVED. */
  formula?: string;
  inputFields?: NutritionField[];
  /** A scan transcription is not the same as an independently verified value. */
  verificationStatus?: 'VERIFIED' | 'TRANSCRIBED_UNVERIFIED';
}

export type NutritionEvidenceMap = Partial<Record<NutritionField, NutritionEvidence>>;

export type PersonaType = 'ADULT' | 'DIABETIC' | 'INFANT' | 'CHILD' | 'CARDIAC' | 'RENAL';

export type ReferenceStatus =
  | 'STATUTORY_MANDATE'   // Formally gazetted and legally enforced
  | 'OFFICIAL_ADVISORY'   // Published scientific dietary recommendation (e.g. ICMR-NIN 2024 DGI)
  | 'DRAFT_PROPOSAL'      // Proposed regulatory draft
  | 'CLINICAL_HEURISTIC'; // Medical consensus guidance

export type FrequencyGrade =
  | 'SUITABLE_FOR_REGULAR_USE'
  | 'ENJOY_IN_MODERATION'
  | 'BEST_KEPT_OCCASIONAL'
  | 'NOT_EVALUABLE';

export type EvaluabilityStatus =
  | 'EVALUABLE'
  | 'SOURCE_UNVERIFIED'
  | 'LABEL_INCOMPLETE'
  | 'NOT_EVALUABLE'
  | 'BASIS_MISMATCH';

export interface EvaluabilityReport {
  status: EvaluabilityStatus;
  canShowGrade: boolean;
  provenancePolicy?: 'VERIFIED_PACK_GRADED' | 'PROVISIONAL_UNGRADED';
  missingFields: NutritionField[];
  unverifiedFields: NutritionField[];
  optionalMissingFields: NutritionField[];
  notes: string[];
}

export interface RawNutritionInput {
  productName: string;
  brand: string;
  category: string;
  form: FoodForm;
  /**
   * The basis of the declared per-100 values. A liquid product is not
   * automatically labelled per 100 ml: ketchup and sauces are normally per
   * 100 g. Do not guess this from `form`.
   */
  nutritionBasis: NutritionDeclarationBasis;
  /**
   * A packaged product must use its own label evidence. IFCT composition rows
   * are generic commodity values and may only support a `GENERIC_FOOD` input.
   * The default is the fail-closed packaged-product context.
   */
  nutritionContext?: 'PACKAGED_PRODUCT' | 'GENERIC_FOOD';
  servingSizeGrams?: number;
  packageWeightGrams?: number;
  energyKcal?: number;
  proteinG?: number;
  carbsG?: number;
  totalSugarG?: number;
  addedSugarG?: number;
  addedFatG?: number;
  totalFatG?: number;
  saturatedFatG?: number;
  transFatG?: number;
  cholesterolMg?: number;
  sodiumMg?: number;
  saltG?: number;
  fiberG?: number;
  polyolsG?: number;
  ingredientsText?: string;
  insAdditives?: string[];
  /** Field-level evidence. Missing evidence means the value is unverified. */
  nutritionEvidence?: NutritionEvidenceMap;
}

export interface NormalizedNutrition {
  /** Basis used by the declared per-100 figures. */
  basis: NutritionDeclarationBasis;
  per100g: {
    energyKcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    totalSugarG: number | null;
    addedSugarG: number | null;
    isAddedSugarEstimated: boolean;
    addedSugarSource: DeclaredValueSource;
    addedFatG: number | null;
    totalFatG: number | null;
    saturatedFatG: number | null;
    transFatG: number | null;
    cholesterolMg: number | null;
    sodiumMg: number | null;
    saltG: number | null;
    fiberG: number | null;
    polyolsG: number | null;
  };
  perServing: {
    servingSizeGrams: number | null;
    energyKcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    totalSugarG: number | null;
    addedSugarG: number | null;
    isAddedSugarEstimated: boolean;
    addedSugarSource: DeclaredValueSource;
    addedFatG: number | null;
    totalFatG: number | null;
    saturatedFatG: number | null;
    transFatG: number | null;
    cholesterolMg: number | null;
    sodiumMg: number | null;
    saltG: number | null;
    fiberG: number | null;
    polyolsG: number | null;
  };
}

export interface ConsistencyAuditResult {
  isPlausible: boolean;
  atwaterEnergy: {
    declaredKcal: number | null;
    calculatedKcal: number | null;
    discrepancyPercent: number | null;
    passed: boolean;
    reason: string;
    fssaiEquationUsed?: string;
  };
  massConservation: {
    totalMacroGramsPer100g: number | null;
    passed: boolean;
    reason: string;
  };
  labelConsistency: {
    passed: boolean;
    notes: string[];
  };
  stapleBoundsCheck?: {
    isStaple: boolean;
    matchedFoodCode?: string;
    passed: boolean;
    reason?: string;
  };
  overallConfidence: 'HIGH' | 'SUSPECT' | 'CORRUPT';
}

export interface ScientificCitation {
  issuingBody: string;
  guidelineName: string;
  year: number;
  legalStatus: ReferenceStatus;
  derivationNote: string;
  standardId?: string;
  version?: string;
  effectiveDate?: string;
  /** Publication date for a draft or consultation document; not an effective date. */
  publishedDate?: string;
  sourceId?: string;
  sourceUrl?: string;
  page?: number;
}

export interface Table151CheckResult {
  nutrient: 'Energy' | 'Added Sugar' | 'Added Fat' | 'Salt' | 'Saturated Fat';
  unit: string;
  productValuePer100: number | null;
  cutoffPer100: number;
  isBreached: boolean | null;
  note?: string;
  citation: ScientificCitation;
}

export interface DecodedIngredient {
  rawToken: string;
  normalizedName: string;
  category: 'BASE_FOOD' | 'ADDED_SUGAR' | 'HIGH_GI_CARB' | 'FAT_OIL' | 'ADDITIVE' | 'UNCLASSIFIED';
  insCode?: string;
  functionalClass?: FunctionalClass;
  processingGroup?: ProcessingClassification;
  statutoryWarnings?: string[];
  declaredPercentage?: number; // QUID % w/w or % v/v
  subIngredients?: string[];   // For compound ingredients
  quidNonCompliance?: string;
  allergenTags: string[];
  advisoryTags?: string[];
  allergenStatus?: 'CONTAINS' | 'MAY_CONTAIN' | 'FREE_FROM' | 'NONE';
  facts: string;
  whyFlagged?: string;
  isWarning: boolean;
}

export interface PersonaVerdict {
  personaId: 'ADULT' | 'DIABETIC' | 'INFANT_UNDER_2' | 'CHILD_OVER_2' | 'CARDIAC' | 'RENAL';
  personaName: string;
  status: 'GREEN_SUITABLE' | 'YELLOW_MODERATE' | 'RED_LIMIT_AVOID' | 'INSUFFICIENT_DATA';
  headline: string;
  reason: string;
  citation: string;
}

export interface AssessmentDescriptor {
  rubricId: 'DGI_2024_TABLE_15_1_DECLARED_NUTRIENTS';
  classification: 'BEVERAGE' | 'CONDIMENT' | 'OIL_FAT' | 'LIQUID_FOOD' | 'SOLID_FOOD';
  basis: NutritionDeclarationBasis;
  standardsUsed: string[];
  limitations: string[];
}

export interface ClaimVerificationResult {
  claim: string;
  category: 'SUGAR' | 'PROTEIN' | 'FIBRE' | 'FAT' | 'SODIUM' | 'CHOLESTEROL';
  status: 'VERIFIED_COMPLIANT' | 'MISLEADING_BREACH' | 'CANNOT_BE_VERIFIED';
  reason: string;
  statutoryBasis: string;
}

export interface MarketingClaimsAudit {
  assessedClaims: ClaimVerificationResult[];
  hasMisleadingClaims: boolean;
  summary: string[];
}

export interface CompleteEvaluationOutput {
  productFacts: {
    productName: string;
    brand: string;
    category: string;
    form: FoodForm;
    nutritionBasis: NutritionDeclarationBasis;
    servingSizeG: number | null;
    packageWeightG: number | null;
    packMultiplier: number | null;
  };
  consistencyAudit: ConsistencyAuditResult;
  /** Consumers must not present an evaluation as verified when this is not source-backed. */
  sourceIntegrity: {
    status: 'SOURCE_BACKED' | 'DERIVED_SOURCE_BACKED' | 'INCOMPLETE' | 'UNSUPPORTED';
    completeForEvaluation: boolean;
    unsupportedFields: NutritionField[];
    missingFields: NutritionField[];
    derivedFields: NutritionField[];
    optionalMissingFields: NutritionField[];
    basisMismatchFields: NutritionField[];
    notes: string[];
  };
  evaluability: EvaluabilityReport;
  assessment: AssessmentDescriptor;
  claimsAudit?: MarketingClaimsAudit;
  quidAudit?: QuidAuditResult;
  statutoryWarnings?: StatutoryWarningTrigger[];
  processingClassificationSummary?: {
    groupACount: number;
    groupBCount: number;
    groupCCount: number;
    isUltraProcessed: boolean;
  };
  normalizedNutrition: NormalizedNutrition;
  table151HfssChecks: Table151CheckResult[];
  /** NOT_EVALUABLE means the UI must not show a green/amber health badge. */
  frequencyGrade: FrequencyGrade;
  isGraded: boolean;
  badgeLabel: string;
  whySummary: string[];
  visualizers: {
    sugarTeaspoonsPer100: number | null;
    sugarTeaspoonsPerServing: number | null;
    sugarTeaspoonsWholePack: number | null;
    saltGramsPer100: number | null;
    saltGramsPerServing: number | null;
    saltGramsWholePack: number | null;
    sodiumPercentDvPerServing: number | null;
    addedSugarPercentDvPerServing: number | null;
  };
  ingredientsAnalysis: {
    totalTokens: number;
    classifiedCount: number;
    coveragePercent: number;
    decoded: DecodedIngredient[];
    unclassifiedTokens: string[];
    allergenTagsDetected: string[];
    statutoryAllergenTags: string[];
    advisoryTags: string[];
    mayContainAllergenTags: string[];
    freeFromClaims: string[];
    statutoryWarningsTriggered?: StatutoryWarningTrigger[];
    quidAudit?: QuidAuditResult;
    processingClassificationSummary?: {
      groupACount: number;
      groupBCount: number;
      groupCCount: number;
      isUltraProcessed: boolean;
    };
  };
  familyVerdicts: PersonaVerdict[];
  practicalTip: string;
  betterAlternativesSuggestion: string;
}
