import type { NutritionEvidenceKind } from './types.js';

export interface NutritionSourceDefinition {
  sourceId: string;
  kind: NutritionEvidenceKind;
  publisher: string;
  title: string;
  year?: number;
  authority: 'OFFICIAL_BODY' | 'RESEARCH_BODY' | 'MANUFACTURER' | 'DERIVATION_RULE';
  notes: string;
  sourceUrl?: string;
}

/**
 * Metadata for sources the engine is allowed to cite. This registry does not
 * contain guessed nutrient numbers. Numbers must arrive with a locator into
 * one of these sources (or a product-specific manufacturer label reference).
 */
export const NUTRITION_SOURCE_REGISTRY: Readonly<Record<string, NutritionSourceDefinition>> = {
  ICMR_NIN_IFCT_2017: {
    sourceId: 'ICMR_NIN_IFCT_2017',
    kind: 'OFFICIAL_RESEARCH_TABLE',
    publisher: 'ICMR - National Institute of Nutrition',
    title: 'Indian Food Composition Tables 2017',
    year: 2017,
    authority: 'OFFICIAL_BODY',
    notes:
      'Reference composition data for generic Indian foods and ingredients; not a substitute for a packaged product label. Use the IFCT food code as the row locator.',
  },
  ICMR_NIN_DGI_2024: {
    sourceId: 'ICMR_NIN_DGI_2024',
    kind: 'OFFICIAL_RESEARCH_TABLE',
    publisher: 'ICMR - National Institute of Nutrition',
    title: 'Dietary Guidelines for Indians 2024',
    year: 2024,
    authority: 'OFFICIAL_BODY',
    notes:
      'Advisory guideline and threshold source. It is not used to invent a product nutrient value.',
  },
  FSSAI_LABELLING_2020: {
    sourceId: 'FSSAI_LABELLING_2020',
    kind: 'OFFICIAL_RESEARCH_TABLE',
    publisher: 'Food Safety and Standards Authority of India',
    title: 'Food Safety and Standards (Labelling and Display) Regulations, 2020',
    year: 2020,
    authority: 'OFFICIAL_BODY',
    notes:
      'Statutory labelling, QUID, Schedule II warnings, and %RDA reference context. Its per-day reference values are not health limits.',
  },
  FSSAI_ADDITIVES_2011: {
    sourceId: 'FSSAI_ADDITIVES_2011',
    kind: 'OFFICIAL_RESEARCH_TABLE',
    publisher: 'Food Safety and Standards Authority of India',
    title: 'Food Safety and Standards (Food Products Standards and Food Additives) Regulations, 2011',
    year: 2011,
    authority: 'OFFICIAL_BODY',
    notes:
      'Codex/FSSAI Functional Classes and INS Additive Appendix A specifications.',
  },
  FSSAI_CLAIMS_2018: {
    sourceId: 'FSSAI_CLAIMS_2018',
    kind: 'OFFICIAL_RESEARCH_TABLE',
    publisher: 'Food Safety and Standards Authority of India',
    title: 'Food Safety and Standards (Advertising and Claims) Regulations, 2018',
    year: 2018,
    authority: 'OFFICIAL_BODY',
    notes:
      'Statutory thresholds for front-of-pack claims including No Added Sugar, High Protein, and High Fibre.',
  },
  FSSAI_SCHOOL_FOOD_DRAFT_2026: {
    sourceId: 'FSSAI_SCHOOL_FOOD_DRAFT_2026',
    kind: 'OFFICIAL_RESEARCH_TABLE',
    publisher: 'Food Safety and Standards Authority of India',
    title: 'Draft Foods for School Children Amendment Regulations, 2026',
    year: 2026,
    authority: 'OFFICIAL_BODY',
    notes:
      'Draft amendment published 10 August 2026 for comment. It is not final law and is never applied as a statutory cutoff by this engine.',
  },
  RSSDI_2022: {
    sourceId: 'RSSDI_2022',
    kind: 'PEER_REVIEWED_RESEARCH',
    publisher: 'Research Society for the Study of Diabetes in India',
    title: 'RSSDI Clinical Practice Recommendations for Management of Type 2 Diabetes, 2022',
    year: 2022,
    authority: 'RESEARCH_BODY',
    notes:
      'Clinical guidance for a cautious diabetic label lens. It contains no 4 g per-serving sugar ceiling.',
  },
  WHO_2023_NSS: {
    sourceId: 'WHO_2023_NSS',
    kind: 'PEER_REVIEWED_RESEARCH',
    publisher: 'World Health Organization',
    title: 'WHO guideline on non-sugar sweeteners, 2023',
    year: 2023,
    authority: 'RESEARCH_BODY',
    notes:
      'Conditional recommendation for non-sugar sweeteners. It is not a pediatric ban and does not set a product threshold.',
  },
  KDIGO_2024_CKD: {
    sourceId: 'KDIGO_2024_CKD',
    kind: 'PEER_REVIEWED_RESEARCH',
    publisher: 'Kidney Disease: Improving Global Outcomes',
    title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD',
    year: 2024,
    authority: 'RESEARCH_BODY',
    notes:
      'Used only for a cautious renal potassium/salt-substitute prompt. It is not food-composition evidence and does not establish renal suitability from a label.',
  },
  SODIUM_TO_SALT_2_5: {
    sourceId: 'SODIUM_TO_SALT_2_5',
    kind: 'DERIVED',
    publisher: 'Food Scanner derivation rule',
    title: 'Sodium to salt equivalent conversion',
    authority: 'DERIVATION_RULE',
    notes:
      'Only a unit conversion: salt (g) = sodium (mg) × 2.5 / 1000. It is never a substitute for an absent nutrition declaration.',
  },
  SALT_TO_SODIUM_400: {
    sourceId: 'SALT_TO_SODIUM_400',
    kind: 'DERIVED',
    publisher: 'Food Scanner derivation rule',
    title: 'Salt to sodium equivalent conversion',
    authority: 'DERIVATION_RULE',
    notes:
      'Only a unit conversion: sodium (mg) = salt (g) × 400. It is never a substitute for an absent nutrition declaration.',
  },
};

export function isRegisteredNutritionSource(sourceId: string): boolean {
  return Object.prototype.hasOwnProperty.call(NUTRITION_SOURCE_REGISTRY, sourceId);
}

export function getNutritionSource(sourceId: string): NutritionSourceDefinition | undefined {
  return NUTRITION_SOURCE_REGISTRY[sourceId];
}
