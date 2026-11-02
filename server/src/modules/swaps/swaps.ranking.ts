import type { PersonaType } from '../engine/types.js';
import type { SwapDelta } from './swaps.types.js';

export interface EvaluatedCandidate {
  barcodeGtin: string;
  productName: string;
  brandName: string;
  category: string;
  mrpInr: number;
  packageWeightG: number;
  pricePer100g: number;
  energyKcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  addedSugar100g: number;
  totalSugar100g: number;
  saturatedFat100g: number;
  transFat100g: number;
  sodiumMg100g: number;
  dietaryFiber100g: number;
  hfssBreachCount: number;
  allergenTags: string[];
  highGiCarbTags: string[];
  insCodes: string[];
}

/**
 * Calculates deterministic nutritional deltas with absolute zero-division safeguards.
 */
export function calculateDelta(
  metric: string,
  scannedValue: number,
  candidateValue: number,
  unit: string,
  lowerIsBetter: boolean
): SwapDelta {
  const safeScanned = Number.isFinite(scannedValue) ? scannedValue : 0;
  const safeCandidate = Number.isFinite(candidateValue) ? candidateValue : 0;
  const absoluteDelta = Math.round((safeCandidate - safeScanned) * 100) / 100;

  let percentDelta: number;
  if (safeScanned === 0) {
    if (safeCandidate === 0) {
      percentDelta = 0;
    } else {
      // Non-zero increase from a zero baseline
      percentDelta = lowerIsBetter ? 100 : -100;
    }
  } else {
    percentDelta = Math.round(((safeCandidate - safeScanned) / safeScanned) * 1000) / 10;
  }

  const isImprovement = lowerIsBetter ? absoluteDelta < 0 : absoluteDelta > 0;

  return {
    metric,
    scannedValue: safeScanned,
    candidateValue: safeCandidate,
    unit,
    absoluteDelta,
    percentDelta,
    isImprovement,
  };
}

/**
 * Pure, deterministic lexicographic sorter per persona.
 * Fail-closed: Missing/NaN values are sorted to the bottom rather than coerced to zero.
 */
function safeAsc(a: number, b: number): number {
  const safeA = Number.isFinite(a) ? a : Infinity;
  const safeB = Number.isFinite(b) ? b : Infinity;
  return safeA - safeB;
}

function safeDesc(a: number, b: number): number {
  const safeA = Number.isFinite(a) ? a : -Infinity;
  const safeB = Number.isFinite(b) ? b : -Infinity;
  return safeB - safeA;
}

export function rankCandidates(
  candidates: EvaluatedCandidate[],
  persona: PersonaType
): EvaluatedCandidate[] {
  return [...candidates].sort((a, b) => {
    switch (persona) {
      case 'DIABETIC': {
        // 1. Lowest added sugar
        if (a.addedSugar100g !== b.addedSugar100g) {
          return safeAsc(a.addedSugar100g, b.addedSugar100g);
        }
        // 2. Fewest high-GI refined carbohydrate tags (maltodextrin, dextrose, etc.)
        if (a.highGiCarbTags.length !== b.highGiCarbTags.length) {
          return a.highGiCarbTags.length - b.highGiCarbTags.length;
        }
        // 3. Highest dietary fiber
        if (a.dietaryFiber100g !== b.dietaryFiber100g) {
          return safeDesc(a.dietaryFiber100g, b.dietaryFiber100g);
        }
        // 4. Lowest total energy
        if (a.energyKcal100g !== b.energyKcal100g) {
          return safeAsc(a.energyKcal100g, b.energyKcal100g);
        }
        // 5. Lowest price per 100g
        return safeAsc(a.pricePer100g, b.pricePer100g);
      }

      case 'CARDIAC': {
        // 1. Lowest sodium
        if (a.sodiumMg100g !== b.sodiumMg100g) {
          return safeAsc(a.sodiumMg100g, b.sodiumMg100g);
        }
        // 2. Lowest saturated fat
        if (a.saturatedFat100g !== b.saturatedFat100g) {
          return safeAsc(a.saturatedFat100g, b.saturatedFat100g);
        }
        // 3. Lowest trans fat
        if (a.transFat100g !== b.transFat100g) {
          return safeAsc(a.transFat100g, b.transFat100g);
        }
        // 4. Highest dietary fiber
        if (a.dietaryFiber100g !== b.dietaryFiber100g) {
          return safeDesc(a.dietaryFiber100g, b.dietaryFiber100g);
        }
        // 5. Lowest price per 100g
        return safeAsc(a.pricePer100g, b.pricePer100g);
      }

      case 'RENAL': {
        // Renal profiles must avoid potassium-chloride salt substitutes first,
        // then minimize sodium and saturated fat.
        const aPotassium = a.insCodes.some((code) => code.toLowerCase() === '508') ? 1 : 0;
        const bPotassium = b.insCodes.some((code) => code.toLowerCase() === '508') ? 1 : 0;
        if (aPotassium !== bPotassium) return aPotassium - bPotassium;
        if (a.sodiumMg100g !== b.sodiumMg100g) return safeAsc(a.sodiumMg100g, b.sodiumMg100g);
        if (a.saturatedFat100g !== b.saturatedFat100g) return safeAsc(a.saturatedFat100g, b.saturatedFat100g);
        return safeAsc(a.pricePer100g, b.pricePer100g);
      }

      case 'INFANT': {
        // 1. Strict 0g added sugar priority
        const aZeroSugar = a.addedSugar100g === 0 ? 0 : 1;
        const bZeroSugar = b.addedSugar100g === 0 ? 0 : 1;
        if (aZeroSugar !== bZeroSugar) {
          return aZeroSugar - bZeroSugar;
        }
        // 2. Lowest sodium
        if (a.sodiumMg100g !== b.sodiumMg100g) {
          return safeAsc(a.sodiumMg100g, b.sodiumMg100g);
        }
        // 3. Fewest additive INS codes
        if (a.insCodes.length !== b.insCodes.length) {
          return a.insCodes.length - b.insCodes.length;
        }
        // 4. Lowest saturated fat
        return safeAsc(a.saturatedFat100g, b.saturatedFat100g);
      }

      case 'CHILD': {
        // 1. Lowest added sugar
        if (a.addedSugar100g !== b.addedSugar100g) {
          return safeAsc(a.addedSugar100g, b.addedSugar100g);
        }
        // 2. Lowest saturated fat
        if (a.saturatedFat100g !== b.saturatedFat100g) {
          return safeAsc(a.saturatedFat100g, b.saturatedFat100g);
        }
        // 3. Highest protein & fiber sum
        const aNutritionSum = a.proteinG100g + a.dietaryFiber100g;
        const bNutritionSum = b.proteinG100g + b.dietaryFiber100g;
        if (aNutritionSum !== bNutritionSum) {
          return safeDesc(aNutritionSum, bNutritionSum);
        }
        // 4. Lowest price per 100g
        return safeAsc(a.pricePer100g, b.pricePer100g);
      }

      case 'ADULT':
      default: {
        // 1. Fewest ICMR Table 15.1 HFSS breaches
        if (a.hfssBreachCount !== b.hfssBreachCount) {
          return a.hfssBreachCount - b.hfssBreachCount;
        }
        // 2. Lowest added sugar
        if (a.addedSugar100g !== b.addedSugar100g) {
          return safeAsc(a.addedSugar100g, b.addedSugar100g);
        }
        // 3. Lowest sodium
        if (a.sodiumMg100g !== b.sodiumMg100g) {
          return safeAsc(a.sodiumMg100g, b.sodiumMg100g);
        }
        // 4. Highest dietary fiber
        if (a.dietaryFiber100g !== b.dietaryFiber100g) {
          return safeDesc(a.dietaryFiber100g, b.dietaryFiber100g);
        }
        // 5. Lowest price per 100g
        return safeAsc(a.pricePer100g, b.pricePer100g);
      }
    }
  });
}
