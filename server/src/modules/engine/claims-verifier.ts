import type {
  ClaimVerificationResult,
  MarketingClaimsAudit,
  NormalizedNutrition,
  RawNutritionInput,
} from './types.js';

export type { ClaimVerificationResult, MarketingClaimsAudit };

const SWEETENING_AGENTS = [
  'sugar',
  'sucrose',
  'liquid glucose',
  'glucose syrup',
  'corn syrup',
  'corn syrup solids',
  'high fructose corn syrup',
  'invert sugar',
  'invert sugar syrup',
  'invert syrup',
  'rice syrup',
  'jaggery',
  'gur',
  'khandsari',
  'bura',
  'honey',
  'maltodextrin',
  'dextrose',
  'maltose',
  'fructose',
];

/**
 * Audits Front-of-Pack Marketing Claims against the official
 * Food Safety and Standards (Advertising and Claims) Regulations, 2018 (Schedule I).
 */
export class ClaimsVerifier {
  public static verifyClaims(
    raw: RawNutritionInput,
    normalized: NormalizedNutrition,
    frontOfPackText: string = ''
  ): MarketingClaimsAudit {
    const p100 = normalized.per100g;
    const isSolid = raw.form === 'SOLID';
    const unitLabel = isSolid ? 'g' : 'ml';
    // Only scan product name and front-of-pack claims text, NEVER raw.ingredientsText
    const textToScan = `${raw.productName} ${frontOfPackText}`.toLowerCase();

    const results: ClaimVerificationResult[] = [];
    const summary: string[] = [];

    // 1. "No Added Sugar" Claim Check (FSSAI Regulation 4(3) & Schedule I)
    if (/\b(?:no\s+added\s+sugars?|zero\s+added\s+sugars?|without\s+added\s+sugars?|unsweetened)\b/i.test(textToScan)) {
      const addedSugar = p100.addedSugarG;
      const lowerIngredients = (raw.ingredientsText || '').toLowerCase();
      const detectedSweeteners = SWEETENING_AGENTS.filter((agent) =>
        new RegExp(`\\b${agent.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lowerIngredients)
      );

      if (addedSugar !== null && addedSugar > 0) {
        results.push({
          claim: 'No Added Sugar',
          category: 'SUGAR',
          status: 'MISLEADING_BREACH',
          reason: `Packaging claims 'No Added Sugar', but the nutrition table declares ${addedSugar}g added sugar per 100${unitLabel}.`,
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018, Regulation 4(3) & Schedule I',
        });
      } else if (detectedSweeteners.length > 0) {
        results.push({
          claim: 'No Added Sugar',
          category: 'SUGAR',
          status: 'MISLEADING_BREACH',
          reason: `Packaging claims 'No Added Sugar', but ingredients list sweetening/hydrolysed carbohydrate agents: ${detectedSweeteners.join(', ')}.`,
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018 (Non-addition claims for sugars)',
        });
      } else if (addedSugar === 0) {
        results.push({
          claim: 'No Added Sugar',
          category: 'SUGAR',
          status: 'VERIFIED_COMPLIANT',
          reason: `0g added sugar declared and no sweetening agents identified in the ingredient list.${
            p100.totalSugarG && p100.totalSugarG > 0
              ? ' Pack must display: "CONTAINS NATURALLY OCCURRING SUGARS".'
              : ''
          }`,
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018, Schedule I',
        });
      } else {
        results.push({
          claim: 'No Added Sugar',
          category: 'SUGAR',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Added sugar is not declared on the nutrition panel; claim cannot be verified.',
          statutoryBasis: 'FSSAI (Advertising and Claims) Regulations 2018, Schedule I',
        });
      }
    }

    // 2. "Sugar Free" / "Zero Sugar" Claim Check (FSSAI Schedule I, Item 3: <= 0.5g per 100g/ml)
    if (
      /\b(?:sugar[-\s]*free|zero\s+sugars?)\b/i.test(textToScan) &&
      !/\b(?:no|zero|without)\s+added\s+sugars?\b/i.test(textToScan)
    ) {
      const totalSugar = p100.totalSugarG;
      if (totalSugar === null) {
        results.push({
          claim: 'Sugar Free',
          category: 'SUGAR',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Total sugar is not declared on the nutrition table.',
          statutoryBasis: 'FSSAI Schedule I (Item 3 - Sugars)',
        });
      } else if (totalSugar <= 0.5) {
        results.push({
          claim: 'Sugar Free',
          category: 'SUGAR',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared total sugar (${totalSugar}g/100${unitLabel}) is within the statutory limit (<= 0.5g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 3 - Sugars)',
        });
      } else {
        results.push({
          claim: 'Sugar Free',
          category: 'SUGAR',
          status: 'MISLEADING_BREACH',
          reason: `Declared total sugar (${totalSugar}g/100${unitLabel}) exceeds the statutory 'Sugar Free' limit (<= 0.5g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 3 - Sugars)',
        });
      }
    }

    // 3. "High Protein" vs "Source of Protein" Check (FSSAI Schedule I, Item 13: RDA = 54g)
    // Source: >= 10% RDA per 100g (5.4g) for solids or >= 5% RDA per 100ml (2.7g) for liquids
    // High:   >= 20% RDA per 100g (10.8g) for solids or >= 10% RDA per 100ml (5.4g) for liquids
    const isHighProteinClaim = /\b(?:high\s+(?:in\s+)?protein|rich\s+in\s+protein|protein\s+rich)\b/i.test(textToScan);
    const isSourceProteinClaim =
      !isHighProteinClaim && /\b(?:source\s+of\s+protein|good\s+source\s+of\s+protein|with\s+protein)\b/i.test(textToScan);

    if (isHighProteinClaim || isSourceProteinClaim) {
      const protein = p100.proteinG;
      const claimLabel = isHighProteinClaim ? 'High Protein' : 'Source of Protein';
      const threshold = isHighProteinClaim ? (isSolid ? 10.8 : 5.4) : (isSolid ? 5.4 : 2.7);
      if (protein === null) {
        results.push({
          claim: claimLabel,
          category: 'PROTEIN',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Protein is not declared on the label; claim cannot be verified.',
          statutoryBasis: 'FSSAI Schedule I (Item 13 - Protein)',
        });
      } else if (protein >= threshold) {
        results.push({
          claim: claimLabel,
          category: 'PROTEIN',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared protein (${protein}g/100${unitLabel}) meets the statutory threshold (>= ${threshold}g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 13 - Protein)',
        });
      } else {
        results.push({
          claim: claimLabel,
          category: 'PROTEIN',
          status: 'MISLEADING_BREACH',
          reason: `Declared protein (${protein}g/100${unitLabel}) fails the statutory minimum for '${claimLabel}' (required >= ${threshold}g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 13 - Protein)',
        });
      }
    }

    // 4. "High Fibre" vs "Source of Fibre" Check (FSSAI Schedule I, Item 14)
    // Source: >= 3g/100g (solids) or >= 1.5g/100ml (liquids)
    // High:   >= 6g/100g (solids) or >= 3.0g/100ml (liquids)
    const isHighFibreClaim = /\b(?:high\s+(?:in\s+)?fib(?:re|er)|rich\s+in\s+fib(?:re|er)|fib(?:re|er)\s+rich)\b/i.test(textToScan);
    const isSourceFibreClaim =
      !isHighFibreClaim && /\b(?:(?:good\s+)?source\s+of\s+(?:dietary\s+)?fib(?:re|er)|with\s+added\s+fib(?:re|er))\b/i.test(textToScan);

    if (isHighFibreClaim || isSourceFibreClaim) {
      const fiber = p100.fiberG;
      const claimLabel = isHighFibreClaim ? 'High Fibre' : 'Source of Fibre';
      const threshold = isHighFibreClaim ? (isSolid ? 6.0 : 3.0) : (isSolid ? 3.0 : 1.5);
      if (fiber === null) {
        results.push({
          claim: claimLabel,
          category: 'FIBRE',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Dietary fibre is not declared on the label; claim cannot be verified.',
          statutoryBasis: 'FSSAI Schedule I (Item 14 - Dietary Fibre)',
        });
      } else if (fiber >= threshold) {
        results.push({
          claim: claimLabel,
          category: 'FIBRE',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared dietary fibre (${fiber}g/100${unitLabel}) meets the statutory threshold (>= ${threshold}g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 14 - Dietary Fibre)',
        });
      } else {
        results.push({
          claim: claimLabel,
          category: 'FIBRE',
          status: 'MISLEADING_BREACH',
          reason: `Declared dietary fibre (${fiber}g/100${unitLabel}) is below the ${threshold}g/100${unitLabel} statutory requirement for '${claimLabel}'.`,
          statutoryBasis: 'FSSAI Schedule I (Item 14 - Dietary Fibre)',
        });
      }
    }

    // 5. "Low Fat" / "Fat Free" Check (FSSAI Schedule I, Item 2)
    // Low Fat: <= 3g/100g (solids) or <= 1.5g/100ml (liquids)
    // Fat Free: <= 0.5g/100g or 100ml
    if (/\b(?:low\s+fat|fat[-\s]*free|zero\s+fat)\b/i.test(textToScan) && !/\btrans\s*fat\b/i.test(textToScan)) {
      const isFatFreeClaim = /\b(?:fat[-\s]*free|zero\s+fat)\b/i.test(textToScan);
      const totalFat = p100.totalFatG;
      const threshold = isFatFreeClaim ? 0.5 : isSolid ? 3.0 : 1.5;
      const claimLabel = isFatFreeClaim ? 'Fat Free' : 'Low Fat';

      if (totalFat === null) {
        results.push({
          claim: claimLabel,
          category: 'FAT',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Total fat is not declared on the label.',
          statutoryBasis: 'FSSAI Schedule I (Item 2 - Fat)',
        });
      } else if (totalFat <= threshold) {
        results.push({
          claim: claimLabel,
          category: 'FAT',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared total fat (${totalFat}g/100${unitLabel}) is within the statutory limit (<= ${threshold}g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 2 - Fat)',
        });
      } else {
        results.push({
          claim: claimLabel,
          category: 'FAT',
          status: 'MISLEADING_BREACH',
          reason: `Declared total fat (${totalFat}g/100${unitLabel}) exceeds the statutory limit (<= ${threshold}g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 2 - Fat)',
        });
      }
    }

    // 6. "Trans Fat Free" Check (FSSAI Schedule I, Item 6: < 0.2g per 100g/ml)
    if (/\b(?:trans\s*fat[-\s]*free|zero\s+trans\s*fat|no\s+trans\s*fat)\b/i.test(textToScan)) {
      const transFat = p100.transFatG;
      if (transFat === null) {
        results.push({
          claim: 'Trans Fat Free',
          category: 'FAT',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Trans fat is not declared on the label.',
          statutoryBasis: 'FSSAI Schedule I (Item 6 - Trans Fat)',
        });
      } else if (transFat < 0.2) {
        results.push({
          claim: 'Trans Fat Free',
          category: 'FAT',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared trans fat (${transFat}g/100${unitLabel}) complies with the statutory 'Trans Fat Free' threshold (< 0.2g/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 6 - Trans Fat)',
        });
      } else {
        results.push({
          claim: 'Trans Fat Free',
          category: 'FAT',
          status: 'MISLEADING_BREACH',
          reason: `Declared trans fat (${transFat}g/100${unitLabel}) violates the '< 0.2g/100${unitLabel}' limit for a 'Trans Fat Free' claim.`,
          statutoryBasis: 'FSSAI Schedule I (Item 6 - Trans Fat)',
        });
      }
    }

    // 7. "Cholesterol Free" / "Low Cholesterol" Check (FSSAI Schedule I, Item 5)
    // Free: < 5mg/100g (solids) or < 5mg/100ml (liquids) AND saturated fat < 1.5g/100g (solids) or < 0.75g/100ml (liquids)
    if (/\b(?:cholesterol[-\s]*free|zero\s+cholesterol|no\s+cholesterol)\b/i.test(textToScan)) {
      const chol = p100.cholesterolMg;
      const satFat = p100.saturatedFatG;
      const maxSatFat = isSolid ? 1.5 : 0.75;
      if (chol === null || satFat === null) {
        results.push({
          claim: 'Cholesterol Free',
          category: 'CHOLESTEROL',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Cholesterol and saturated fat must both be declared to verify a Cholesterol Free claim.',
          statutoryBasis: 'FSSAI Schedule I (Item 5 - Cholesterol)',
        });
      } else if (chol < 5 && satFat <= maxSatFat) {
        results.push({
          claim: 'Cholesterol Free',
          category: 'CHOLESTEROL',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared cholesterol (${chol}mg/100${unitLabel}) is < 5mg and saturated fat (${satFat}g/100${unitLabel}) is <= ${maxSatFat}g.`,
          statutoryBasis: 'FSSAI Schedule I (Item 5 - Cholesterol)',
        });
      } else {
        results.push({
          claim: 'Cholesterol Free',
          category: 'CHOLESTEROL',
          status: 'MISLEADING_BREACH',
          reason: `FSSAI requires cholesterol < 5mg/100${unitLabel} AND saturated fat <= ${maxSatFat}g/100${unitLabel} (declared: ${chol}mg cholesterol, ${satFat}g saturated fat).`,
          statutoryBasis: 'FSSAI Schedule I (Item 5 - Cholesterol)',
        });
      }
    }

    // 8. "Low Sodium" / "Sodium Free" Check (FSSAI Schedule I, Item 7)
    // Low: <= 120mg sodium per 100g/ml; Very Low: <= 40mg; Free: <= 5mg
    if (/\b(?:low\s+(?:in\s+)?sodium|low\s+salt|sodium[-\s]*free)\b/i.test(textToScan)) {
      const isSodiumFree = /\bsodium[-\s]*free\b/i.test(textToScan);
      const sodium = p100.sodiumMg;
      const limit = isSodiumFree ? 5 : 120;
      const claimLabel = isSodiumFree ? 'Sodium Free' : 'Low Sodium';
      if (sodium === null) {
        results.push({
          claim: claimLabel,
          category: 'SODIUM',
          status: 'CANNOT_BE_VERIFIED',
          reason: 'Sodium is not declared on the nutrition panel.',
          statutoryBasis: 'FSSAI Schedule I (Item 7 - Sodium/Salt)',
        });
      } else if (sodium <= limit) {
        results.push({
          claim: claimLabel,
          category: 'SODIUM',
          status: 'VERIFIED_COMPLIANT',
          reason: `Declared sodium (${sodium}mg/100${unitLabel}) meets the statutory limit (<= ${limit}mg/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 7 - Sodium/Salt)',
        });
      } else {
        results.push({
          claim: claimLabel,
          category: 'SODIUM',
          status: 'MISLEADING_BREACH',
          reason: `Declared sodium (${sodium}mg/100${unitLabel}) exceeds the statutory '${claimLabel}' limit (<= ${limit}mg/100${unitLabel}).`,
          statutoryBasis: 'FSSAI Schedule I (Item 7 - Sodium/Salt)',
        });
      }
    }

    const hasMisleadingClaims = results.some((r) => r.status === 'MISLEADING_BREACH');
    for (const r of results) {
      if (r.status === 'MISLEADING_BREACH') {
        summary.push(`⚠️ Misleading claim alert: ${r.reason}`);
      } else if (r.status === 'VERIFIED_COMPLIANT') {
        summary.push(`✅ Verified claim: ${r.claim} meets statutory FSSAI Schedule I criteria.`);
      }
    }

    return {
      assessedClaims: results,
      hasMisleadingClaims,
      summary,
    };
  }
}
