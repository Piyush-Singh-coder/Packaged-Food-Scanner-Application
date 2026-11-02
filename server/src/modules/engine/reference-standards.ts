import type { ReferenceStatus, ScientificCitation } from './types.js';

export interface RegulatoryStandardSet {
  standardId: string;
  version: string;
  effectiveDate?: string;
  publishedDate?: string;
  legalStatus: ReferenceStatus;
  citation: string;
  thresholdsSolidPer100g: {
    energyKcal: number;
    addedSugarG: number;
    addedFatG: number;
    saltMg: number;
  };
  thresholdsLiquidPer100ml: {
    energyKcal: number;
    addedSugarG: number;
    addedFatG: number;
    saltMg: number;
  };
}

const DGI_CITATION: ScientificCitation = {
  issuingBody: 'ICMR-NIN',
  guidelineName: 'Dietary Guidelines for Indians 2024, Table 15.1 (HFSS reference thresholds)',
  year: 2024,
  legalStatus: 'OFFICIAL_ADVISORY' as ReferenceStatus,
  derivationNote:
    'Table 15.1 is an advisory HFSS screening reference. It is not a product health grade, a clinical prescription, or a statutory ban.',
  standardId: 'ICMR_NIN_TABLE_15_1_HFSS',
  version: '2024',
  sourceId: 'ICMR_NIN_DGI_2024',
};

const DGI_DAILY_CITATION: ScientificCitation = {
  issuingBody: 'ICMR-NIN',
  guidelineName: 'Dietary Guidelines for Indians 2024 — daily dietary reference values',
  year: 2024,
  legalStatus: 'OFFICIAL_ADVISORY' as ReferenceStatus,
  derivationNote:
    'Adult reference values: salt intake above 5 g/day (sodium above 2,000 mg/day) is high; added sugar above 25 g/day at a 2,000 kcal reference is high; saturated fat above 5% of energy is high. These are daily references, not per-snack clinical ceilings.',
  sourceId: 'ICMR_NIN_DGI_2024',
};

const FSSAI_LABEL_CITATION: ScientificCitation = {
  issuingBody: 'FSSAI',
  guidelineName: 'Food Safety and Standards (Labelling and Display) Regulations, 2020',
  year: 2020,
  legalStatus: 'STATUTORY_MANDATE' as ReferenceStatus,
  derivationNote:
    'The %RDA table is a labelling reference for declared nutrients (2,000 kcal, 67 g fat, 22 g saturated fat, 2 g trans fat, 50 g added sugar, 2,000 mg sodium). It is not a health limit and must not be substituted for the ICMR-NIN daily guidance.',
  sourceId: 'FSSAI_LABELLING_2020',
};

/** Versioned source registry consumed by the deterministic evaluator. */
export const REGULATORY_STANDARD_REGISTRY: readonly RegulatoryStandardSet[] = [
  {
    standardId: 'ICMR_NIN_TABLE_15_1_HFSS',
    version: '2024',
    effectiveDate: '2024-05-01',
    legalStatus: 'OFFICIAL_ADVISORY',
    citation: 'ICMR-NIN Dietary Guidelines for Indians 2024, Table 15.1',
    thresholdsSolidPer100g: { energyKcal: 250, addedSugarG: 3.0, addedFatG: 4.2, saltMg: 625 },
    thresholdsLiquidPer100ml: { energyKcal: 70, addedSugarG: 2.0, addedFatG: 1.5, saltMg: 175 },
  },
];

export const CURRENT_REGULATORY_STANDARD = REGULATORY_STANDARD_REGISTRY[0];

export const REFERENCE_STANDARDS = {
  // ---------------------------------------------------------------------------
  // 1. ICMR-NIN 2024 Dietary Guidelines for Indians (Table 15.1)
  //    Advisory HFSS screening criteria; not a statutory product grade.
  // ---------------------------------------------------------------------------
  TABLE_15_1_HFSS: {
    SOLID: {
      ENERGY_KCAL_PER_100G: 250.0,
      ADDED_FAT_G_PER_100G: 4.2,
      ADDED_SUGAR_G_PER_100G: 3.0,
      SALT_MG_PER_100G: 625.0,
      SODIUM_EQUIVALENT_MG_PER_100G: 250.0,
      citation: {
        ...DGI_CITATION,
        derivationNote:
          'Per-100 g solid-food HFSS reference. Added fat means added cooking/frying fat, not a mandatory Indian label field; it is never inferred from total fat.',
      } satisfies ScientificCitation,
    },
    LIQUID: {
      ENERGY_KCAL_PER_100ML: 70.0,
      ADDED_FAT_G_PER_100ML: 1.5,
      ADDED_SUGAR_G_PER_100ML: 2.0,
      SALT_MG_PER_100ML: 175.0,
      SODIUM_EQUIVALENT_MG_PER_100ML: 70.0,
      citation: {
        ...DGI_CITATION,
        derivationNote:
          'Per-100 ml beverage HFSS reference. It is not applied to ketchup, sauces, or other liquid foods whose labels are declared per 100 g.',
      } satisfies ScientificCitation,
    },
  },

  // ---------------------------------------------------------------------------
  // 2. National Daily Intakes (Adult 2,000 kcal Reference Diet)
  // ---------------------------------------------------------------------------
  ICMR_NIN_2024_ADULT_DAILY: {
    SODIUM_UPPER_LIMIT_MG: 2000.0,
    SALT_UPPER_LIMIT_G: 5.0,
    ADDED_SUGAR_CEILING_G: 25.0,
    SATURATED_FAT_ENERGY_PERCENT: 5.0,
    /** No 30 g/day fibre target was verified in DGI 2024; do not invent one. */
    citation: DGI_DAILY_CITATION,
  },

  // ---------------------------------------------------------------------------
  // 3. FSSAI label-reference values. These are not health limits.
  // ---------------------------------------------------------------------------
  FSSAI_LABEL_REFERENCE_2020: {
    ENERGY_KCAL: 2000,
    FAT_G: 67,
    SATURATED_FAT_G: 22,
    TRANS_FAT_G: 2,
    ADDED_SUGAR_G: 50,
    SODIUM_MG: 2000,
    citation: FSSAI_LABEL_CITATION,
  },

  // ---------------------------------------------------------------------------
  // 4. Draft school-food thresholds (NOT law). Retained only so the API can
  //    explain why it does not apply them as statutory cutoffs.
  // ---------------------------------------------------------------------------
  FSSAI_SCHOOL_FOOD_DRAFT_2026: {
    legalStatus: 'DRAFT_PROPOSAL' as ReferenceStatus,
    citation: {
      issuingBody: 'FSSAI',
      guidelineName:
        'Draft Food Safety and Standards (Foods for School Children) Amendment Regulations, 2026 (draft published for comment, 10 August 2026)',
      year: 2026,
      legalStatus: 'DRAFT_PROPOSAL' as ReferenceStatus,
      derivationNote:
        'Draft published for public comment. It mirrors DGI 2024 HFSS thresholds for school foods where stated, but is not final law and is not used as a general adult grade.',
      publishedDate: '2026-08-10',
    } satisfies ScientificCitation,
  },

  // ---------------------------------------------------------------------------
  // 5. Clinical and population lenses. These are label-reading cautions, not
  //    diagnoses or treatment advice.
  // ---------------------------------------------------------------------------
  CLINICAL_LENSES: {
    DIABETIC: {
      /**
       * RSSDI 2022 does not contain a 4 g-per-serving sugar ceiling. The
       * previous number was removed. This list is a refined-carbohydrate
       * caution, not a glycemic-index measurement.
       */
      HIGH_GLYCEMIC_MARKERS: [
        'maltodextrin',
        'liquid glucose',
        'invert sugar syrup',
        'invert sugar',
        'high fructose corn syrup',
        'dextrose',
        'corn syrup solids',
        'glucose syrup',
        'corn syrup',
        'rice syrup',
        'modified starch',
      ],
      citation: {
        issuingBody: 'RSSDI',
        guidelineName: 'RSSDI Clinical Practice Recommendations for Management of Type 2 Diabetes, 2022',
        year: 2022,
        legalStatus: 'CLINICAL_HEURISTIC' as ReferenceStatus,
        derivationNote:
          'Used only for a cautious ingredient/nutrient prompt. RSSDI 2022 does not provide a 4 g per-serving sugar cutoff, so the engine no longer invents one.',
        sourceId: 'RSSDI_2022',
      } satisfies ScientificCitation,
    },
    INFANT_UNDER_2: {
      MAX_ADDED_SUGAR_G: 0.0,
      citation: {
        issuingBody: 'ICMR-NIN',
        guidelineName: 'Dietary Guidelines for Indians 2024 — no added sugar under 2 years',
        year: 2024,
        legalStatus: 'OFFICIAL_ADVISORY' as ReferenceStatus,
        derivationNote:
          'DGI 2024 advises against added sugar for children under 2 years. A label check cannot certify an infant food or replace medical advice.',
        sourceId: 'ICMR_NIN_DGI_2024',
      } satisfies ScientificCitation,
    },
    CHILD_OVER_2: {
      NON_SUGAR_SWEETENERS_ADVISORY: [
        '950',
        '951',
        '954',
        '955',
        '960',
        '961',
        '962',
        '969',
      ],
      citation: {
        issuingBody: 'WHO',
        guidelineName: 'WHO guideline on non-sugar sweeteners, 2023',
        year: 2023,
        legalStatus: 'OFFICIAL_ADVISORY' as ReferenceStatus,
        derivationNote:
          'WHO makes a conditional recommendation against using non-sugar sweeteners for weight control and notes that guidance for children is not available. This is not a pediatric ban and is not a substitute for clinical advice.',
        sourceId: 'WHO_2023_NSS',
      } satisfies ScientificCitation,
    },
    CARDIAC: {
      /**
       * 400 mg is exactly 20% of the DGI 2,000 mg daily sodium reference. It
       * is a transparent single-serving share, not a Cardiological Society of
       * India per-snack ceiling (no primary CSI source for that claim was
       * verified).
       */
      SINGLE_SERVING_SODIUM_REFERENCE_MG: 400.0,
      POTASSIUM_CHLORIDE_SALT_SUBSTITUTE: 'ins 508',
      citation: {
        ...DGI_DAILY_CITATION,
        derivationNote:
          'One serving above 400 mg sodium supplies more than 20% of the DGI 2,000 mg daily sodium reference. This is a nutrient-share prompt, not a CSI clinical cutoff.',
      } satisfies ScientificCitation,
    },
    RENAL: {
      POTASSIUM_CHLORIDE_SALT_SUBSTITUTE: 'ins 508',
      citation: {
        issuingBody: 'KDIGO',
        guidelineName: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD',
        year: 2024,
        legalStatus: 'CLINICAL_HEURISTIC' as ReferenceStatus,
        derivationNote:
          'Potassium chloride salt substitutes may be unsuitable for some people with kidney disease. A label cannot establish renal suitability; absence of INS 508 is not a green safety verdict.',
        sourceId: 'KDIGO_2024_CKD',
      } satisfies ScientificCitation,
    },
  },
};

export const ARTIFICIAL_SWEETENERS: Record<string, string> = {
  '950': 'Acesulfame Potassium',
  '951': 'Aspartame',
  '954': 'Saccharin',
  '955': 'Sucralose',
  '960': 'Steviol Glycosides',
  '961': 'Neotame',
  '962': 'Aspartame-Acesulfame Salt',
  '969': 'Advantame',
};
