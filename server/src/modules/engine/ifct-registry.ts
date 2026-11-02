import type { NutritionEvidenceMap, RawNutritionInput } from './types.js';

export interface IfctNutrientProfile {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  totalFatG: number;
  dietaryFiberG?: number;
  sodiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
}

export interface IfctFoodEntry {
  foodCode: string;
  name: string;
  commonIndianName?: string;
  scientificName: string;
  group: 'CEREALS' | 'PULSES' | 'VEGETABLES' | 'FRUITS' | 'NUTS_SEEDS' | 'MILK_DAIRY' | 'SPICES';
  tableCitation: {
    table: string;
    /** Only include a page when it was checked against the printed table. */
    page?: number;
    foodGroup: string;
  };
  per100gEdible: IfctNutrientProfile;
}

/**
 * Authentic baseline food composition values from the official
 * ICMR-NIN Indian Food Composition Tables (IFCT 2017), published by the
 * National Institute of Nutrition, Hyderabad.
 *
 * The food code is the stable row locator. Page numbers are intentionally not
 * invented: a page is included only where it was verified against the printed
 * table.
 *
 * ARCHITECTURAL RULE:
 * IFCT composition data is authoritative for generic, unbranded commodities
 * (whole wheat grain, milled rice, raw dal, fresh milk, groundnut, fruit, and
 * vegetables). It must NEVER be used to invent or synthesize nutrition facts
 * for branded packaged foods (biscuits, instant noodles, soft drinks).
 *
 * IFCT does not report total sugar, added sugar, added fat, saturated fat, or
 * trans fat in this registry. Those fields are therefore omitted, not filled
 * with zeros or derived from total fat.
 */
export const ICMR_IFCT_2017_CATALOG: Readonly<Record<string, IfctFoodEntry>> = {
  A020: {
    foodCode: 'A020',
    name: 'Wheat, whole',
    commonIndianName: 'Gehun / whole wheat',
    scientificName: 'Triticum aestivum',
    group: 'CEREALS',
    tableCitation: {
      table: 'IFCT 2017 — Cereals and Millets',
      foodGroup: 'Cereals',
    },
    per100gEdible: {
      energyKcal: 321.9,
      proteinG: 10.59,
      carbsG: 64.72,
      totalFatG: 1.47,
      dietaryFiberG: 11.23,
      sodiumMg: 2.50,
    },
  },
  A015: {
    foodCode: 'A015',
    name: 'Rice, raw, milled',
    commonIndianName: 'Chawal',
    scientificName: 'Oryza sativa',
    group: 'CEREALS',
    tableCitation: {
      table: 'IFCT 2017 — Cereals and Millets',
      foodGroup: 'Cereals',
    },
    per100gEdible: {
      energyKcal: 356.4,
      proteinG: 7.94,
      carbsG: 78.24,
      totalFatG: 0.52,
      dietaryFiberG: 2.81,
      sodiumMg: 2.34,
    },
  },
  B002: {
    foodCode: 'B002',
    name: 'Bengal gram, whole',
    commonIndianName: 'Kala Chana',
    scientificName: 'Cicer arietinum',
    group: 'PULSES',
    tableCitation: {
      table: 'IFCT 2017 — Grain Legumes',
      foodGroup: 'Grain Legumes',
    },
    per100gEdible: {
      energyKcal: 287.0,
      proteinG: 18.77,
      carbsG: 39.56,
      totalFatG: 5.11,
      dietaryFiberG: 25.22,
      sodiumMg: 26.56,
    },
  },
  B021: {
    foodCode: 'B021',
    name: 'Red gram, dal',
    commonIndianName: 'Toor Dal / Arhar Dal',
    scientificName: 'Cajanus cajan',
    group: 'PULSES',
    tableCitation: {
      table: 'IFCT 2017 — Grain Legumes',
      foodGroup: 'Grain Legumes',
    },
    per100gEdible: {
      energyKcal: 330.8,
      proteinG: 21.70,
      carbsG: 55.23,
      totalFatG: 1.56,
      dietaryFiberG: 9.06,
      sodiumMg: 18.01,
    },
  },
  L002: {
    foodCode: 'L002',
    name: 'Cow milk',
    commonIndianName: 'Gai ka doodh',
    scientificName: 'Bos taurus',
    group: 'MILK_DAIRY',
    tableCitation: {
      table: 'IFCT 2017 — Milk and Milk Products',
      foodGroup: 'Milk',
    },
    per100gEdible: {
      energyKcal: 72.9,
      proteinG: 3.26,
      carbsG: 4.48,
      totalFatG: 4.94,
      sodiumMg: 25.46,
    },
  },
  H012: {
    foodCode: 'H012',
    name: 'Groundnut, with skin',
    commonIndianName: 'Moongphali / Peanut',
    scientificName: 'Arachis hypogaea',
    group: 'NUTS_SEEDS',
    tableCitation: {
      table: 'IFCT 2017 — Nuts and Oil Seeds',
      foodGroup: 'Nuts and Seeds',
    },
    per100gEdible: {
      energyKcal: 520.1,
      proteinG: 23.65,
      // IFCT row order for H012 is energy, protein, fat, carbohydrate.
      // These two values were previously transposed in this registry.
      carbsG: 17.27,
      totalFatG: 39.63,
      dietaryFiberG: 10.38,
      sodiumMg: 12.21,
    },
  },
  E009: {
    foodCode: 'E009',
    name: 'Banana, ripe',
    commonIndianName: 'Kela',
    scientificName: 'Musa paradisiaca',
    group: 'FRUITS',
    tableCitation: {
      table: 'IFCT 2017 — Fruits',
      foodGroup: 'Fruits',
    },
    per100gEdible: {
      energyKcal: 110.7,
      proteinG: 1.25,
      carbsG: 24.95,
      totalFatG: 0.32,
      dietaryFiberG: 2.21,
    },
  },
  D075: {
    foodCode: 'D075',
    name: 'Tomato, ripe, red',
    commonIndianName: 'Tamatar',
    scientificName: 'Lycopersicon esculentum',
    group: 'VEGETABLES',
    tableCitation: {
      table: 'IFCT 2017 — Vegetables',
      foodGroup: 'Vegetables',
    },
    per100gEdible: {
      energyKcal: 18.9,
      proteinG: 0.76,
      carbsG: 3.20,
      totalFatG: 0.25,
      dietaryFiberG: 1.58,
      sodiumMg: 11.86,
    },
  },
  D076: {
    foodCode: 'D076',
    name: 'Tomato, ripe, red (second IFCT sample)',
    commonIndianName: 'Tamatar',
    scientificName: 'Lycopersicon esculentum',
    group: 'VEGETABLES',
    tableCitation: {
      table: 'IFCT 2017 — Vegetables',
      foodGroup: 'Vegetables',
    },
    per100gEdible: {
      energyKcal: 19.6,
      proteinG: 0.90,
      carbsG: 2.71,
      totalFatG: 0.47,
      dietaryFiberG: 1.77,
      sodiumMg: 9.73,
    },
  },
};

export class IfctRegistry {
  public static getByCode(code: string): IfctFoodEntry | undefined {
    const normalized = code.toUpperCase().replace(/^IFCT_/, '');
    return ICMR_IFCT_2017_CATALOG[normalized];
  }

  public static search(query: string): IfctFoodEntry[] {
    const q = query.toLowerCase().trim();
    return Object.values(ICMR_IFCT_2017_CATALOG).filter(
      (entry) =>
        entry.name.toLowerCase().includes(q) ||
        entry.commonIndianName?.toLowerCase().includes(q) ||
        entry.scientificName.toLowerCase().includes(q)
    );
  }

  /**
   * Converts an IFCT entry into RawNutritionInput with field-level
   * traceability. Only fields actually present in the IFCT row receive
   * evidence. The function never creates serving sizes, package weights,
   * total sugar, added sugar, added fat, saturated fat, or trans fat.
   */
  public static toRawNutritionInput(entry: IfctFoodEntry): RawNutritionInput {
    const n = entry.per100gEdible;
    const locatorBase = `IFCT_2017:${entry.foodCode}`;

    const makeEvidence = (field: string) => ({
      kind: 'OFFICIAL_RESEARCH_TABLE' as const,
      sourceId: 'ICMR_NIN_IFCT_2017',
      sourceTitle: 'ICMR-NIN Indian Food Composition Tables 2017',
      publisher: 'ICMR - National Institute of Nutrition, Hyderabad',
      basis: 'PER_100G' as const,
      locator: `${locatorBase}:${field}`,
      verificationStatus: 'VERIFIED' as const,
    });

    const nutritionEvidence: NutritionEvidenceMap = {
      energyKcal: makeEvidence('energyKcal'),
      proteinG: makeEvidence('proteinG'),
      carbsG: makeEvidence('carbsG'),
      totalFatG: makeEvidence('totalFatG'),
    };
    if (n.sodiumMg !== undefined) nutritionEvidence.sodiumMg = makeEvidence('sodiumMg');
    if (n.dietaryFiberG !== undefined) nutritionEvidence.fiberG = makeEvidence('dietaryFiberG');

    return {
      productName: `${entry.name}${entry.commonIndianName ? ` (${entry.commonIndianName})` : ''}`,
      brand: 'Generic Indian Food (ICMR-NIN IFCT 2017)',
      category: entry.group,
      form: entry.group === 'MILK_DAIRY' ? 'LIQUID' : 'SOLID',
      nutritionBasis: 'PER_100G',
      nutritionContext: 'GENERIC_FOOD',
      energyKcal: n.energyKcal,
      proteinG: n.proteinG,
      carbsG: n.carbsG,
      totalFatG: n.totalFatG,
      sodiumMg: n.sodiumMg,
      fiberG: n.dietaryFiberG,
      ingredientsText: entry.name,
      nutritionEvidence,
    };
  }
}
