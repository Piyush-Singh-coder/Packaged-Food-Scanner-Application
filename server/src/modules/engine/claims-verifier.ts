import type { NormalizedNutrition, RawNutritionInput } from './types.js';

/**
 * Audit of Front-of-Pack Marketing Claims against
 * Food Safety and Standards (Advertising and Claims) Regulations, 2018.
 */

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

const SWEETENING_AGENTS = [
  'sugar',
  'sucrose',
  'liquid glucose',
  'glucose syrup',
  'corn syrup',
  'high fructose corn syrup',
  'invert sugar',
  'invert syrup',
  'jaggery',
  'gur',
  'honey',
  'maltodextrin',
  'dextrose',
];

export class ClaimsVerifier {
  /**
   * Scans text for declared marketing claims and validates them against the nutrition facts and ingredients.
   */
  public static verifyClaims(
    raw: RawNutritionInput,
    normalized: NormalizedNutrition,
    frontOfPackText: string = ''
  ): MarketingClaimsAudit {
    const p100 = normalized.per100g;
    const isSolid = raw.form === 'SOLID';
    const textToScan = `${raw.productName} ${frontOfPackText} ${raw.ingredientsText || ''}`.toLowerCase();
    const results: ClaimVerificationResult[] = [];
    const summary: string[] = [];

    // 1. "No Added Sugar" Claim Check
    if (/\b(?:no\s+added\s+sugar|zero\s+added\s+sugar|without\s+added\s+sugar)\b/i.test(textToScan)) {
      const addedSugar = p100.addedSugarG;
      const lowerIngredients = (raw.ingredientsText || '').toLowerCase();
      const detectedSweeteners = SWEETENING_AGENTS.filter((agent) => lowerIngredients.includes(agent));

      if (addedSugar !== null && addedSugar > 0) {
        results.push({
          claim: 'No Added Sugar',
          category: 'SUGAR',
          status: 'MISLEADING_BREACH',
          reason: `Packaging claims 'No Added Sugar', but the nutrition table declares ${addedSugar}g added sugar per 100g.`,
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018, Regulation 4(3) & Schedule I',
        });
      } else if (detectedSweeteners.length > 0) {
        results.push({
          claim: 'No Added Sugar',
          category: 'SUGAR',
          status: 'MISLEADING_BREACH',
          reason: `Packaging claims 'No Added Sugar', but ingredients list sweetening agents: ${detectedSweeteners.join(', ')}.`,
          statutoryBasis: 'FSSAI Advertising and Claims Regulations 2018 (Non-addition claims for sugars)',
        });
      } else if (addedSugar === 0 || addedSugar === null) {
        results.push({
          claim: 'No Added Sugar',
          category: 'SUGAR',
          status: 'VERIFIED_COMPLIANT',
          reason: `No added sugar declared and no sweetening agents identified in the ingredient list.${
            p100.totalSugarG && p100.totalSugarG > 0
              ? ' Label should carry the advisory: "CONTAINS NATURALLY OCCURRING SUGARS".'
              : ''
          }`,
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018',
        });
      }
    }

    // 2. "High Protein" / "Source of Protein" Check
    if (/\b(?:high\s+(?:in\s+)?protein|rich\s+in\s+protein|protein\s+rich)\b/i.test(textToScan)) {
      const protein = p100.proteinG;
      // FSSAI criteria: >= 20% of RDA (54g adult RDA) => >= 10.8g per 100g solids, or >= 5.4g per 100ml liquids
      const threshold = isSolid ? 10.8 : 5.4;

      if (protein === null) {
        results.push({
          claim: 'High Protein',
          category: 'PROTEIN',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Protein is not declared on the label; claim cannot be verified.',
          statutoryBasis: 'FSSAI Schedule I (Nutrient Content Claims)',
        });
      } else if (protein >= threshold) {
        results.push({
          claim: 'High Protein',
          category: 'PROTEIN',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared protein (${protein}g/100${isSolid ? 'g' : 'ml'}) meets the statutory threshold (>= ${threshold}g/100${isSolid ? 'g' : 'ml'}, 20% RDA).`,
          statutoryBasis: 'FSSAI Schedule I (Nutrient Content Claims)',
        });
      } else {
        results.push({
          claim: 'High Protein',
          category: 'PROTEIN',
          status: 'MISLEADING_BREACH',
          reason: `Declared protein (${protein}g/100${isSolid ? 'g' : 'ml'}) fails the statutory minimum for 'High Protein' (required >= ${threshold}g/100${isSolid ? 'g' : 'ml'}).`,
          statutoryBasis: 'FSSAI Schedule I (Nutrient Content Claims)',
        });
      }
    }

    // 3. "High Fibre" / "Dietary Fibre" Check
    if (/\b(?:high\s+(?:in\s+)?fib(?:re|er)|rich\s+in\s+fib(?:re|er)|good\s+source\s+of\s+fib(?:re|er))\b/i.test(textToScan)) {
      const fiber = p100.fiberG;
      // FSSAI criteria: Source >= 3g/100g, High in fibre >= 6g/100g
      const threshold = 6.0;

      if (fiber === null) {
        results.push({
          claim: 'High Fibre',
          category: 'FIBRE',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Dietary fibre is not declared on the label; claim cannot be verified.',
          statutoryBasis: 'FSSAI Schedule I (Fibre Content Claims)',
        });
      } else if (fiber >= threshold) {
        results.push({
          claim: 'High Fibre',
          category: 'FIBRE',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared dietary fibre (${fiber}g/100g) meets the statutory high-fibre threshold (>= 6g/100g).`,
          statutoryBasis: 'FSSAI Schedule I (Fibre Content Claims)',
        });
      } else {
        results.push({
          claim: 'High Fibre',
          category: 'FIBRE',
          status: 'MISLEADING_BREACH',
          reason: `Declared dietary fibre (${fiber}g/100g) is below the 6g/100g statutory requirement for 'High Fibre'.`,
          statutoryBasis: 'FSSAI Schedule I (Fibre Content Claims)',
        });
      }
    }

    // 4. "Low Fat" / "Fat Free" Check
    if (/\b(?:low\s+fat|fat\s*free|zero\s+fat)\b/i.test(textToScan)) {
      const isFatFreeClaim = /\b(?:fat\s*free|zero\s+fat)\b/i.test(textToScan);
      const totalFat = p100.totalFatG;
      const threshold = isFatFreeClaim ? 0.5 : (isSolid ? 3.0 : 1.5);

      if (totalFat === null) {
        results.push({
          claim: isFatFreeClaim ? 'Fat Free' : 'Low Fat',
          category: 'FAT',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Total fat is not declared on the label.',
          statutoryBasis: 'FSSAI Schedule I',
        });
      } else if (totalFat <= threshold) {
        results.push({
          claim: isFatFreeClaim ? 'Fat Free' : 'Low Fat',
          category: 'FAT',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared total fat (${totalFat}g/100g) is within the statutory limit (<= ${threshold}g/100g).`,
          statutoryBasis: 'FSSAI Schedule I',
        });
      } else {
        results.push({
          claim: isFatFreeClaim ? 'Fat Free' : 'Low Fat',
          category: 'FAT',
          status: 'MISLEADING_BREACH',
          reason: `Declared total fat (${totalFat}g/100g) exceeds the statutory limit (<= ${threshold}g/100g).`,
          statutoryBasis: 'FSSAI Schedule I',
        });
      }
    }

    // 5. "Trans Fat Free" Check
    if (/\b(?:trans\s*fat\s*free|zero\s+trans\s*fat|no\s+trans\s*fat)\b/i.test(textToScan)) {
      const transFat = p100.transFatG;
      // FSSAI voluntary claim threshold: <= 0.2g per 100g/ml
      if (transFat === null) {
        results.push({
          claim: 'Trans Fat Free',
          category: 'FAT',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Trans fat is not declared on the label.',
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018',
        });
      } else if (transFat <= 0.2) {
        results.push({
          claim: 'Trans Fat Free',
          category: 'FAT',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared trans fat (${transFat}g/100g) complies with the voluntary 'Trans Fat Free' logo threshold (<= 0.2g/100g).`,
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018',
        });
      } else {
        results.push({
          claim: 'Trans Fat Free',
          category: 'FAT',
          status: 'MISLEADING_BREACH',
          reason: `Declared trans fat (${transFat}g/100g) exceeds the 0.2g/100g limit for a 'Trans Fat Free' claim.`,
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018',
        });
      }
    }

    const hasMisleadingClaims = results.some((r) => r.status === 'MISLEADING_BREACH');
    for (const r of results) {
      if (r.status === 'MISLEADING_BREACH') {
        summary.push(`⚠️ Misleading claim alert: ${r.reason}`);
      } else if (r.status === 'VERIFIED_COMPLIANT') {
        summary.push(`✓ Verified claim: ${r.claim} meets statutory FSSAI criteria.`);
      }
    }

    return {
      assessedClaims: results,
      hasMisleadingClaims,
      summary,
    };
  }
}
