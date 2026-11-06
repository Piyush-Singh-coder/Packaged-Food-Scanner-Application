/**
 * Reproducibility harness for the AaharIQ manuscript.
 *
 * Produces:
 *   1. A controlled label-fault injection experiment over synthetic base
 *      profiles (NOT commercial SKU claims).
 *   2. Microbenchmarks of the deterministic evaluation path.
 *
 * Run with:
 *   npx tsx benchmarks/paper-evaluation.ts
 */
import crypto from 'node:crypto';
import { EvaluationService } from '../src/modules/engine/evaluation.service.js';
import { NutrientVerifier } from '../src/modules/engine/nutrient-verifier.js';
import { rankCandidates, type EvaluatedCandidate } from '../src/modules/swaps/swaps.ranking.js';
import type {
  NutritionEvidenceMap,
  NutritionField,
  RawNutritionInput,
} from '../src/modules/engine/types.js';

type BaseProfile = Omit<RawNutritionInput, 'nutritionEvidence'> & {
  id: string;
};

const fieldNames: NutritionField[] = [
  'energyKcal',
  'proteinG',
  'carbsG',
  'totalSugarG',
  'addedSugarG',
  'totalFatG',
  'saturatedFatG',
  'transFatG',
  'cholesterolMg',
  'sodiumMg',
  'fiberG',
];

function evidenceFor(profile: BaseProfile): NutritionEvidenceMap {
  const map: NutritionEvidenceMap = {};
  for (const field of fieldNames) {
    if (profile[field] === undefined) continue;
    map[field] = {
      kind: 'MANUFACTURER_LABEL',
      sourceId: `PACK_PHOTO:${profile.id}`,
      sourceTitle: `Synthetic label fixture ${profile.id}`,
      publisher: 'Benchmark harness',
      basis: profile.nutritionBasis,
      locator: `fixture:${profile.id}:${field}`,
      capturedAt: '2026-01-01T00:00:00.000Z',
      artifactHash: `sha256:${crypto.createHash('sha256').update(`${profile.id}-${field}`).digest('hex')}`,
      verificationStatus: 'VERIFIED',
    };
  }
  return map;
}

function withEvidence(profile: BaseProfile): RawNutritionInput {
  return { ...profile, nutritionEvidence: evidenceFor(profile) };
}

/**
 * Twelve synthetic base profiles modelled on common Indian packaged-food
 * categories. Energy is derived from the declared macros so that every clean
 * profile is Atwater-consistent by construction.
 */
const bases: BaseProfile[] = [
  {
    id: 'biscuit',
    productName: 'Glucose Biscuit',
    brand: 'Fixture',
    category: 'Biscuits & Bakery',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 25,
    packageWeightGrams: 100,
    energyKcal: 452,
    proteinG: 7.0,
    carbsG: 72.0,
    totalSugarG: 24.0,
    addedSugarG: 20.0,
    totalFatG: 15.0,
    saturatedFatG: 7.0,
    transFatG: 0.1,
    cholesterolMg: 0,
    sodiumMg: 420,
    fiberG: 2.5,
    ingredientsText: 'Refined wheat flour (maida), sugar, edible vegetable oil (palm), invert sugar syrup, salt, raising agent (INS 500(ii)), emulsifier (INS 322).',
  },
  {
    id: 'namkeen',
    productName: 'Masala Namkeen',
    brand: 'Fixture',
    category: 'Savory Snacks',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 30,
    packageWeightGrams: 150,
    energyKcal: 536,
    proteinG: 8.0,
    carbsG: 56.0,
    totalSugarG: 3.0,
    addedSugarG: 1.0,
    totalFatG: 31.0,
    saturatedFatG: 12.0,
    transFatG: 0.2,
    cholesterolMg: 0,
    sodiumMg: 890,
    fiberG: 4.0,
    ingredientsText: 'Gram flour (besan), edible vegetable oil, rice flakes, peanuts, salt, spices and condiments, acidity regulator (INS 330).',
  },
  {
    id: 'cereal',
    productName: 'Chocolate Breakfast Cereal',
    brand: 'Fixture',
    category: 'Breakfast Cereals',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 30,
    packageWeightGrams: 250,
    energyKcal: 402,
    proteinG: 8.0,
    carbsG: 78.0,
    totalSugarG: 28.0,
    addedSugarG: 24.0,
    totalFatG: 6.0,
    saturatedFatG: 3.0,
    transFatG: 0.0,
    cholesterolMg: 0,
    sodiumMg: 310,
    fiberG: 4.0,
    ingredientsText: 'Whole wheat flour, sugar, cocoa solids, maltodextrin, edible vegetable oil, invert syrup, salt, vitamins and minerals.',
  },
  {
    id: 'noodles',
    productName: 'Instant Masala Noodles',
    brand: 'Fixture',
    category: 'Instant Noodles & Pasta',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 70,
    packageWeightGrams: 70,
    energyKcal: 427,
    proteinG: 8.0,
    carbsG: 63.5,
    totalSugarG: 2.2,
    addedSugarG: 1.8,
    totalFatG: 15.7,
    saturatedFatG: 6.8,
    transFatG: 0.12,
    cholesterolMg: 0,
    sodiumMg: 1230,
    fiberG: 2.0,
    ingredientsText: 'Refined wheat flour (maida), palm oil, salt, sugar, hydrolysed groundnut protein, flavour enhancer (INS 621), acidity regulator (INS 330).',
  },
  {
    id: 'juice',
    productName: 'Mixed Fruit Juice',
    brand: 'Fixture',
    category: 'Fruit Juices',
    form: 'LIQUID',
    nutritionBasis: 'PER_100ML',
    servingSizeGrams: 200,
    packageWeightGrams: 1000,
    energyKcal: 52,
    proteinG: 0.3,
    carbsG: 13.0,
    totalSugarG: 12.5,
    addedSugarG: 8.0,
    totalFatG: 0.0,
    saturatedFatG: 0.0,
    transFatG: 0.0,
    cholesterolMg: 0,
    sodiumMg: 12,
    fiberG: 0.2,
    ingredientsText: 'Water, fruit juice concentrate (mango, apple), sugar, acidity regulator (INS 330), antioxidant (INS 300).',
  },
  {
    id: 'softdrink',
    productName: 'Cola Soft Drink',
    brand: 'Fixture',
    category: 'Carbonated Drinks',
    form: 'LIQUID',
    nutritionBasis: 'PER_100ML',
    servingSizeGrams: 250,
    packageWeightGrams: 750,
    energyKcal: 44,
    proteinG: 0.0,
    carbsG: 11.0,
    totalSugarG: 11.0,
    addedSugarG: 11.0,
    totalFatG: 0.0,
    saturatedFatG: 0.0,
    transFatG: 0.0,
    cholesterolMg: 0,
    sodiumMg: 15,
    fiberG: 0.0,
    ingredientsText: 'Carbonated water, sugar, colour (INS 150d), acidity regulator (INS 338), flavourings.',
  },
  {
    id: 'dairy',
    productName: 'Sweetened Yogurt',
    brand: 'Fixture',
    category: 'Dairy',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 100,
    packageWeightGrams: 400,
    energyKcal: 118,
    proteinG: 3.5,
    carbsG: 18.0,
    totalSugarG: 17.0,
    addedSugarG: 12.0,
    totalFatG: 3.2,
    saturatedFatG: 2.0,
    transFatG: 0.0,
    cholesterolMg: 8,
    sodiumMg: 52,
    fiberG: 0.0,
    ingredientsText: 'Milk, sugar, milk solids, stabiliser (INS 440), flavouring.',
  },
  {
    id: 'sauce',
    productName: 'Tomato Ketchup',
    brand: 'Fixture',
    category: 'Sauces & Condiments',
    form: 'LIQUID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 15,
    packageWeightGrams: 500,
    energyKcal: 112,
    proteinG: 1.2,
    carbsG: 26.0,
    totalSugarG: 22.0,
    addedSugarG: 18.0,
    totalFatG: 0.2,
    saturatedFatG: 0.0,
    transFatG: 0.0,
    cholesterolMg: 0,
    sodiumMg: 940,
    fiberG: 1.0,
    ingredientsText: 'Tomato paste, sugar, salt, acidity regulator (INS 260), preservative (INS 211), stabiliser (INS 415).',
  },
  {
    id: 'chocolate',
    productName: 'Milk Chocolate',
    brand: 'Fixture',
    category: 'Chocolates & Confectionery',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 20,
    packageWeightGrams: 50,
    energyKcal: 535,
    proteinG: 7.0,
    carbsG: 58.0,
    totalSugarG: 52.0,
    addedSugarG: 48.0,
    totalFatG: 30.0,
    saturatedFatG: 18.0,
    transFatG: 0.1,
    cholesterolMg: 12,
    sodiumMg: 120,
    fiberG: 2.0,
    ingredientsText: 'Sugar, cocoa butter, milk solids, cocoa solids, emulsifier (INS 322), flavouring (vanillin).',
  },
  {
    id: 'maltdrink',
    productName: 'Malted Health Drink',
    brand: 'Fixture',
    category: 'Health Drinks & Malt Powders',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 30,
    packageWeightGrams: 500,
    energyKcal: 388,
    proteinG: 10.0,
    carbsG: 82.0,
    totalSugarG: 34.0,
    addedSugarG: 28.0,
    totalFatG: 2.5,
    saturatedFatG: 1.2,
    transFatG: 0.0,
    cholesterolMg: 0,
    sodiumMg: 240,
    fiberG: 3.0,
    ingredientsText: 'Malted barley, wheat flour, sugar, maltodextrin, cocoa solids, milk solids, vitamins and minerals.',
  },
  {
    id: 'infant',
    productName: 'Infant Cereal',
    brand: 'Fixture',
    category: 'Infant Foods',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 25,
    packageWeightGrams: 300,
    energyKcal: 380,
    proteinG: 12.0,
    carbsG: 72.0,
    totalSugarG: 6.0,
    addedSugarG: 0.0,
    totalFatG: 5.0,
    saturatedFatG: 2.0,
    transFatG: 0.0,
    cholesterolMg: 0,
    sodiumMg: 110,
    fiberG: 5.0,
    ingredientsText: 'Rice flour, wheat flour, milk solids, maltodextrin, vitamins and minerals.',
  },
  {
    id: 'yogurt',
    productName: 'Plain Non-Fat Yogurt',
    brand: 'Fixture',
    category: 'Dairy',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 100,
    packageWeightGrams: 400,
    energyKcal: 53,
    proteinG: 5.0,
    carbsG: 7.0,
    totalSugarG: 5.0,
    addedSugarG: 0.0,
    totalFatG: 0.5,
    saturatedFatG: 0.2,
    transFatG: 0.0,
    cholesterolMg: 2,
    sodiumMg: 50,
    fiberG: 0.0,
    ingredientsText: 'Milk, live cultures.',
  },
  {
    id: 'oil',
    productName: 'Refined Cooking Oil',
    brand: 'Fixture',
    category: 'Cooking Oils',
    form: 'LIQUID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 10,
    packageWeightGrams: 1000,
    energyKcal: 900,
    proteinG: 0.0,
    carbsG: 0.0,
    totalSugarG: 0.0,
    addedSugarG: 0.0,
    totalFatG: 100.0,
    saturatedFatG: 22.0,
    transFatG: 0.1,
    cholesterolMg: 0,
    sodiumMg: 0,
    fiberG: 0.0,
    ingredientsText: 'Refined rice bran oil, antioxidant (INS 319).',
  },
];

type Fault = {
  name: string;
  category: 'corrupting' | 'structural' | 'arithmetic';
  apply: (p: BaseProfile) => BaseProfile;
  /** True when the engine is expected to withhold a grade. */
  expectBlocked: boolean;
};

const faults: Fault[] = [
  {
    name: 'Energy inflated by 50%',
    category: 'corrupting',
    expectBlocked: true,
    apply: (p) => ({ ...p, energyKcal: Math.round(p.energyKcal! * 1.5) }),
  },
  {
    name: 'Energy deflated by 50%',
    category: 'corrupting',
    expectBlocked: true,
    apply: (p) => ({ ...p, energyKcal: Math.round(p.energyKcal! * 0.5) }),
  },
  {
    name: 'Energy decimal shift (x10)',
    category: 'corrupting',
    expectBlocked: true,
    apply: (p) => ({ ...p, energyKcal: p.energyKcal! * 10 }),
  },
  {
    name: 'Zero energy with non-zero macros',
    category: 'corrupting',
    expectBlocked: true,
    apply: (p) => ({ ...p, energyKcal: 0 }),
  },
  {
    name: 'Mass inflation (+40 g carbohydrate)',
    category: 'corrupting',
    expectBlocked: true,
    apply: (p) => ({ ...p, carbsG: p.carbsG! + 40 }),
  },
  {
    name: 'Sodium/salt stoichiometric conflict',
    category: 'corrupting',
    expectBlocked: true,
    apply: (p) => ({ ...p, saltG: 5.0 }),
  },
  {
    name: 'Added sugar exceeds total sugar',
    category: 'arithmetic',
    expectBlocked: false,
    apply: (p) => ({ ...p, addedSugarG: p.totalSugarG! + 5 }),
  },
  {
    name: 'Total sugar exceeds carbohydrate',
    category: 'arithmetic',
    expectBlocked: false,
    apply: (p) => ({ ...p, totalSugarG: p.carbsG! + 5, addedSugarG: Math.min(p.addedSugarG!, p.carbsG!) }),
  },
  {
    name: 'Saturated fat exceeds total fat',
    category: 'arithmetic',
    expectBlocked: false,
    apply: (p) => ({ ...p, saturatedFatG: p.totalFatG! + 5 }),
  },
  {
    name: 'Added sugar field absent',
    category: 'structural',
    expectBlocked: true,
    apply: (p) => {
      const copy = { ...p };
      delete (copy as Partial<BaseProfile>).addedSugarG;
      return copy;
    },
  },
  {
    name: 'Trans fat field absent',
    category: 'structural',
    expectBlocked: true,
    apply: (p) => {
      const copy = { ...p };
      delete (copy as Partial<BaseProfile>).transFatG;
      return copy;
    },
  },
  {
    name: 'Sodium field absent',
    category: 'structural',
    expectBlocked: true,
    apply: (p) => {
      const copy = { ...p };
      delete (copy as Partial<BaseProfile>).sodiumMg;
      return copy;
    },
  },
  {
    name: 'Evidence basis mismatch (per-serving evidence)',
    category: 'structural',
    expectBlocked: true,
    apply: (p) => ({ ...p }),
  },
  {
    name: 'Unverified evidence',
    category: 'structural',
    expectBlocked: true,
    apply: (p) => ({ ...p }),
  },
];

type CaseResult = {
  baseId: string;
  fault: string;
  category: Fault['category'];
  isGraded: boolean;
  evaluability: string;
  confidence: string;
  grade: string;
};

function runCase(base: BaseProfile, fault: Fault | null): CaseResult {
  let profile = fault ? fault.apply(base) : base;
  const evidence = evidenceFor(profile);
  if (fault?.name === 'Evidence basis mismatch (per-serving evidence)') {
    for (const key of Object.keys(evidence) as NutritionField[]) {
      evidence[key] = { ...evidence[key]!, basis: 'PER_SERVING' };
    }
  }
  if (fault?.name === 'Unverified evidence') {
    for (const key of Object.keys(evidence) as NutritionField[]) {
      evidence[key] = { ...evidence[key]!, verificationStatus: 'TRANSCRIBED_UNVERIFIED' };
    }
  }
  const input: RawNutritionInput = { ...profile, nutritionEvidence: evidence };
  const evaluation = EvaluationService.evaluate(input);
  return {
    baseId: base.id,
    fault: fault?.name ?? 'Clean label',
    category: fault?.category ?? 'clean',
    isGraded: evaluation.isGraded,
    evaluability: evaluation.evaluability.status,
    confidence: evaluation.consistencyAudit.overallConfidence,
    grade: evaluation.frequencyGrade,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function runTrial(fn: () => void, iterations: number) {
  const samples = new Array<number>(iterations);
  for (let i = 0; i < iterations; i += 1) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    samples[i] = Number(t1 - t0) / 1000; // microseconds
  }
  samples.sort((a, b) => a - b);
  return {
    p50_us: percentile(samples, 50),
    p95_us: percentile(samples, 95),
    p99_us: percentile(samples, 99),
    mean_us: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

function benchmark(label: string, fn: () => void, iterations: number, trials = 3) {
  // JIT warm-up; excluded from every reported trial.
  for (let i = 0; i < Math.min(2000, iterations); i += 1) fn();
  const runs = Array.from({ length: trials }, () => runTrial(fn, iterations));
  const metric = (key: 'p50_us' | 'p95_us' | 'p99_us' | 'mean_us') =>
    median(runs.map((run) => run[key]));
  const spread = (key: 'p50_us' | 'p99_us') => ({
    min: Math.min(...runs.map((run) => run[key])),
    max: Math.max(...runs.map((run) => run[key])),
  });
  return {
    label,
    iterations,
    trials,
    p50_us: metric('p50_us'),
    p95_us: metric('p95_us'),
    p99_us: metric('p99_us'),
    mean_us: metric('mean_us'),
    p50_range_us: spread('p50_us'),
    p99_range_us: spread('p99_us'),
    runs,
  };
}

const results: CaseResult[] = [];
for (const base of bases) {
  results.push(runCase(base, null));
  for (const fault of faults) results.push(runCase(base, fault));
}

const clean = results.filter((r) => r.category === 'clean');
const corrupting = results.filter((r) => r.category === 'corrupting');
const structural = results.filter((r) => r.category === 'structural');
const arithmetic = results.filter((r) => r.category === 'arithmetic');

const cleanGraded = clean.filter((r) => r.isGraded).length;
const corruptingBlocked = corrupting.filter((r) => !r.isGraded).length;
const structuralBlocked = structural.filter((r) => !r.isGraded).length;
const arithmeticBlocked = arithmetic.filter((r) => !r.isGraded).length;
const arithmeticWarned = arithmetic.filter((r) => r.confidence !== 'HIGH').length;

const byFault = new Map<string, { total: number; blocked: number; warn: number }>();
for (const r of results) {
  const entry = byFault.get(r.fault) ?? { total: 0, blocked: 0, warn: 0 };
  entry.total += 1;
  if (!r.isGraded) entry.blocked += 1;
  if (r.confidence !== 'HIGH') entry.warn += 1;
  byFault.set(r.fault, entry);
}

const verifiedProfiles = bases.map((b) => withEvidence(b));
const singleEval = () => EvaluationService.evaluate(verifiedProfiles[0]!);
const allEval = () => {
  for (const p of verifiedProfiles) EvaluationService.evaluate(p);
};
const layer1 = () => {
  const normalized = NutrientVerifier.normalize(verifiedProfiles[0]!);
  NutrientVerifier.auditConsistency(normalized);
};
const candidates: EvaluatedCandidate[] = Array.from({ length: 1000 }, (_, i) => ({
  barcodeGtin: `890000000${String(i).padStart(4, '0')}`,
  productName: `Candidate ${i}`,
  brandName: 'Fixture',
  category: 'Biscuits & Bakery',
  mrpInr: 20 + (i % 100),
  packageWeightG: 100,
  pricePer100g: 20 + (i % 100),
  energyKcal100g: 300 + (i % 200),
  proteinG100g: 5 + (i % 10),
  carbsG100g: 50 + (i % 30),
  addedSugar100g: i % 30,
  totalSugar100g: (i % 30) + 2,
  saturatedFat100g: i % 15,
  transFat100g: 0.1,
  sodiumMg100g: 100 + (i % 800),
  dietaryFiber100g: i % 8,
  hfssBreachCount: i % 5,
  allergenTags: [],
  highGiCarbTags: [],
  insCodes: [],
}));
const rank = () => rankCandidates(candidates, 'ADULT');

const latencies = [
  benchmark('Layer 1 consistency audit (single label)', layer1, 20_000),
  benchmark('Full deterministic evaluation (single label)', singleEval, 10_000),
  benchmark(`Full evaluation, ${verifiedProfiles.length}-label batch`, allEval, 500),
  benchmark('Lexicographic ranking, 1,000 candidates', rank, 500),
];

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  bases: bases.length,
  totalCases: results.length,
  summary: {
    cleanGraded: `${cleanGraded}/${clean.length}`,
    corruptingBlocked: `${corruptingBlocked}/${corrupting.length}`,
    structuralBlocked: `${structuralBlocked}/${structural.length}`,
    arithmeticBlocked: `${arithmeticBlocked}/${arithmetic.length}`,
    arithmeticWarned: `${arithmeticWarned}/${arithmetic.length}`,
  },
  byFault: Object.fromEntries(byFault),
  latencies,
  cases: results,
}, null, 2));
