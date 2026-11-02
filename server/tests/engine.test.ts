import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IngredientParser } from '../src/modules/engine/ingredient-parser.js';
import { NutrientVerifier } from '../src/modules/engine/nutrient-verifier.js';
import { SourceBackedNutritionEngine } from '../src/modules/engine/source-backed-engine.js';
import { EvaluationService } from '../src/modules/engine/evaluation.service.js';
import type {
  NutritionBasis,
  NutritionEvidenceMap,
  NutritionField,
  RawNutritionInput,
} from '../src/modules/engine/types.js';

function labelEvidence(
  fields: NutritionField[],
  basis: Extract<NutritionBasis, 'PER_100G' | 'PER_100ML'> = 'PER_100G'
): NutritionEvidenceMap {
  return Object.fromEntries(fields.map((field) => [field, {
    kind: 'MANUFACTURER_LABEL' as const,
    sourceId: 'PACK_PHOTO:8900000000000:front-and-nutrition',
    sourceTitle: 'Reviewed manufacturer nutrition panel',
    publisher: 'Packaged-food manufacturer',
    basis,
    locator: `nutrition-table:${field}`,
    sourceUrl: 'https://example.com/reviewed-pack-artefact.jpg',
    artifactHash: 'sha256:6f1ed002ab5595859014ebf0951522d9',
    capturedAt: '2026-01-15T10:00:00.000Z',
    verificationStatus: 'VERIFIED' as const,
  }]));
}

const ALL_REQUIRED_FIELDS: NutritionField[] = [
  'energyKcal', 'proteinG', 'carbsG', 'totalSugarG', 'addedSugarG',
  'totalFatG', 'saturatedFatG', 'transFatG', 'cholesterolMg', 'sodiumMg',
];

function completeVerifiedRaw(overrides: Partial<RawNutritionInput> = {}): RawNutritionInput {
  return {
    productName: 'Reviewed Biscuit',
    brand: 'Test',
    category: 'Biscuits & Cookies',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeGrams: 25,
    packageWeightGrams: 100,
    energyKcal: 200,
    proteinG: 5,
    carbsG: 30,
    totalSugarG: 4,
    addedSugarG: 1,
    totalFatG: 5,
    saturatedFatG: 1,
    transFatG: 0.05,
    cholesterolMg: 0,
    sodiumMg: 100,
    nutritionEvidence: labelEvidence(ALL_REQUIRED_FIELDS),
    ...overrides,
  };
}

describe('Deterministic food intelligence engine boundaries', () => {
  test('flattens nested Indian ingredient declarations without losing INS children', () => {
    const parsed = IngredientParser.parse(
      'Refined wheat flour (Maida), Raising Agents [INS 500(i), INS 503(ii)], Hydrolysed groundnut protein, Soy lecithin, INS 224'
    );

    assert.ok(parsed.decoded.some((item) => item.insCode === '500(i)'));
    assert.ok(parsed.decoded.some((item) => item.insCode === '503(ii)'));
    assert.ok(parsed.allergenTagsDetected.includes('ALLERGEN_GLUTEN'));
    assert.ok(parsed.allergenTagsDetected.includes('ALLERGEN_PEANUT'));
    assert.ok(parsed.allergenTagsDetected.includes('ALLERGEN_SOY'));
    assert.ok(parsed.allergenTagsDetected.includes('ALLERGEN_SULPHITE'));
    assert.ok(parsed.decoded.some((item) => item.category === 'HIGH_GI_CARB'));
    assert.equal(parsed.unclassifiedTokens.length, 0);
  });

  test('does not convert natural dairy sugar into added sugar when the label omits added sugar', () => {
    const normalized = NutrientVerifier.normalize({
      productName: 'Plain Milk',
      brand: 'Test',
      category: 'Dairy & Fresh Milk',
      form: 'LIQUID',
      nutritionBasis: 'PER_100ML',
      servingSizeGrams: 200,
      packageWeightGrams: 1000,
      energyKcal: 58,
      proteinG: 3.1,
      carbsG: 4.7,
      totalSugarG: 4.7,
      totalFatG: 3,
      saturatedFatG: 1.9,
      sodiumMg: 50,
    });

    assert.equal(normalized.per100g.addedSugarG, null);
    assert.equal(normalized.per100g.addedSugarSource, 'NOT_DECLARED');
    assert.equal(normalized.perServing.addedSugarG, null);
    assert.equal(normalized.per100g.sodiumMg, 50);
  });

  test('does not manufacture missing values or infer added sugar from total sugar', () => {
    const normalized = NutrientVerifier.normalize({
      productName: 'Unconfirmed Snack',
      brand: 'Test',
      category: 'Biscuits',
      form: 'SOLID',
      nutritionBasis: 'PER_100G',
      servingSizeGrams: 25,
      packageWeightGrams: 100,
      energyKcal: 400,
      proteinG: 6,
      carbsG: 70,
      totalSugarG: 20,
      totalFatG: 15,
      saturatedFatG: 5,
    });

    assert.equal(normalized.per100g.addedSugarG, null);
    assert.equal(normalized.per100g.addedFatG, null);
    assert.equal(normalized.per100g.transFatG, null);
    assert.equal(normalized.per100g.cholesterolMg, null);
    assert.equal(normalized.per100g.sodiumMg, null);
    assert.equal(normalized.per100g.saltG, null);
  });

  test('requires field-level evidence and records mathematical derivation explicitly', () => {
    const raw = completeVerifiedRaw({
      addedFatG: 2,
      nutritionEvidence: labelEvidence([...ALL_REQUIRED_FIELDS, 'addedFatG']),
    });

    const beforeEvidence = SourceBackedNutritionEngine.inspect(raw);
    assert.equal(beforeEvidence.completeForEvaluation, true);
    assert.equal(beforeEvidence.status, 'SOURCE_BACKED');
    assert.equal(beforeEvidence.unsupportedFields.length, 0);

    const derived = SourceBackedNutritionEngine.deriveSaltFromSodium(raw);
    assert.equal(derived.saltG, 0.25);
    assert.equal(derived.nutritionEvidence?.saltG?.kind, 'DERIVED');
    assert.deepEqual(derived.nutritionEvidence?.saltG?.inputFields, ['sodiumMg']);
    assert.equal(SourceBackedNutritionEngine.inspect(derived).completeForEvaluation, true);
  });

  test('rejects numeric facts without a permitted source reference', () => {
    const raw = completeVerifiedRaw({ nutritionEvidence: {} });

    const report = SourceBackedNutritionEngine.inspect(raw);
    assert.equal(report.completeForEvaluation, false);
    assert.ok(report.unsupportedFields.includes('energyKcal'));
    assert.ok(report.unsupportedFields.includes('sodiumMg'));
  });

  test('does not treat an unreviewed label transcription as verified evidence', () => {
    const evidence = labelEvidence(ALL_REQUIRED_FIELDS);
    evidence.energyKcal = { ...evidence.energyKcal!, verificationStatus: 'TRANSCRIBED_UNVERIFIED' };
    const report = SourceBackedNutritionEngine.inspect(completeVerifiedRaw({ nutritionEvidence: evidence }));

    assert.ok(report.unsupportedFields.includes('energyKcal'));
    assert.equal(report.completeForEvaluation, false);
  });

  test('rejects advisory-guideline citations as product nutrient evidence', () => {
    const evidence = labelEvidence(ALL_REQUIRED_FIELDS);
    evidence.energyKcal = {
      kind: 'OFFICIAL_RESEARCH_TABLE',
      sourceId: 'ICMR_NIN_DGI_2024',
      sourceTitle: 'Dietary Guidelines for Indians 2024',
      publisher: 'ICMR-NIN',
      basis: 'PER_100G',
      locator: 'Table 15.1',
      verificationStatus: 'VERIFIED',
    };

    const report = SourceBackedNutritionEngine.inspect(completeVerifiedRaw({ nutritionEvidence: evidence }));
    assert.ok(report.unsupportedFields.includes('energyKcal'));
    assert.equal(report.completeForEvaluation, false);
  });

  test('withholds a grade when the technical consistency audit is corrupt', () => {
    const evaluation = EvaluationService.evaluate(completeVerifiedRaw({
      energyKcal: 600,
      proteinG: 40,
      carbsG: 80,
      totalSugarG: 10,
      addedSugarG: 5,
      totalFatG: 20,
      saturatedFatG: 5,
    }));

    assert.equal(evaluation.consistencyAudit.overallConfidence, 'CORRUPT');
    assert.equal(evaluation.sourceIntegrity.completeForEvaluation, true);
    assert.equal(evaluation.isGraded, false);
    assert.equal(evaluation.evaluability.status, 'NOT_EVALUABLE');
    assert.equal(evaluation.evaluability.canShowGrade, false);
    assert.equal(evaluation.frequencyGrade, 'NOT_EVALUABLE');
    assert.ok(evaluation.whySummary.some((line) => line.includes('consistency audit')));
  });

  test('treats a contradictory sodium and salt declaration as corrupt', () => {
    const raw = completeVerifiedRaw({
      sodiumMg: 100,
      saltG: 0.5,
      nutritionEvidence: labelEvidence([...ALL_REQUIRED_FIELDS, 'saltG']),
    });

    const normalized = NutrientVerifier.normalize(raw);
    const audit = NutrientVerifier.auditConsistency(normalized);
    assert.equal(audit.labelConsistency.passed, false);
    assert.equal(audit.overallConfidence, 'CORRUPT');

    const evaluation = EvaluationService.evaluate(raw);
    assert.equal(evaluation.sourceIntegrity.completeForEvaluation, true);
    assert.equal(evaluation.isGraded, false);
    assert.equal(evaluation.frequencyGrade, 'NOT_EVALUABLE');
  });

  test('rejects field evidence declared on a different basis than the nutrient values', () => {
    const raw = completeVerifiedRaw({ nutritionEvidence: labelEvidence(ALL_REQUIRED_FIELDS, 'PER_100ML') });
    const report = SourceBackedNutritionEngine.inspect(raw);

    assert.equal(report.completeForEvaluation, false);
    assert.ok(report.basisMismatchFields.includes('energyKcal'));

    const evaluation = EvaluationService.evaluate(raw);
    assert.equal(evaluation.isGraded, false);
    assert.equal(evaluation.evaluability.status, 'BASIS_MISMATCH');
    assert.equal(evaluation.evaluability.canShowGrade, false);
  });

  test('reports a missing sodium/salt declaration once', () => {
    const evidence = labelEvidence(ALL_REQUIRED_FIELDS.filter((field) => field !== 'sodiumMg'));
    const report = SourceBackedNutritionEngine.inspect(completeVerifiedRaw({
      sodiumMg: undefined,
      nutritionEvidence: evidence,
    }));

    assert.equal(report.completeForEvaluation, false);
    assert.equal(report.missingFields.filter((field) => field === 'sodiumMg').length, 1);
  });

  test('withholds a grade when a mandatory FSSAI field is undeclared', () => {
    const raw = completeVerifiedRaw({ cholesterolMg: undefined });
    const evaluation = EvaluationService.evaluate(raw);

    assert.equal(evaluation.sourceIntegrity.completeForEvaluation, false);
    assert.ok(evaluation.sourceIntegrity.missingFields.includes('cholesterolMg'));
    assert.equal(evaluation.isGraded, false);
    assert.equal(evaluation.frequencyGrade, 'NOT_EVALUABLE');
  });

  test('grades only a complete, verified label and never a partial one', () => {
    const evaluation = EvaluationService.evaluate(completeVerifiedRaw());

    assert.equal(evaluation.sourceIntegrity.completeForEvaluation, true);
    assert.equal(evaluation.evaluability.status, 'EVALUABLE');
    assert.equal(evaluation.isGraded, true);
    assert.equal(evaluation.frequencyGrade, 'SUITABLE_FOR_REGULAR_USE');
    assert.equal(evaluation.evaluability.canShowGrade, true);
  });

  test('uses the declared Atwater formula without double-counting fibre', () => {
    const normalized = NutrientVerifier.normalize({
      productName: 'Whole Grain',
      brand: 'Test',
      category: 'Staples',
      form: 'SOLID',
      nutritionBasis: 'PER_100G',
      servingSizeGrams: 100,
      packageWeightGrams: 100,
      energyKcal: 220,
      proteinG: 10,
      carbsG: 25,
      totalSugarG: 2,
      totalFatG: 10,
      saturatedFatG: 2,
      fiberG: 20,
      sodiumMg: 100,
    });

    const audit = NutrientVerifier.auditConsistency(normalized);
    assert.equal(audit.atwaterEnergy.calculatedKcal, 230);
    assert.equal(audit.atwaterEnergy.passed, true);
    assert.equal(audit.massConservation.totalMacroGramsPer100g, 45);
  });

  test('does not falsely classify non-isolated numbers as INS additives', () => {
    const parsed = IngredientParser.parse('Refined Wheat Flour 500g, Iodised Salt, Cocoa solids 100g');
    const matched500 = parsed.decoded.find((d) => d.insCode?.startsWith('500'));
    assert.equal(matched500, undefined, 'Flour 500g must not match INS 500');

    const withIns = IngredientParser.parse('Raising Agents (500(ii), 503(ii))');
    assert.ok(withIns.decoded.some((d) => d.insCode === '500(ii)'));
    assert.ok(withIns.decoded.some((d) => d.insCode === '503(ii)'));
  });

  test('parses common Indian FMCG additives and flags caffeine as a caution', () => {
    const parsed = IngredientParser.parse(
      'Water, Acidity Regulator (INS 260), Antioxidant (INS 300), Color (INS 150d), Acidity Regulator (INS 338), Caffeine'
    );
    assert.ok(parsed.decoded.some((d) => d.insCode === '260'));
    assert.ok(parsed.decoded.some((d) => d.insCode === '300'));
    assert.ok(parsed.decoded.some((d) => d.insCode === '338' && d.isWarning === true));
    assert.ok(parsed.decoded.some((d) => d.normalizedName === 'Caffeine' && d.isWarning === true));
  });

  test('retrieves authentic ICMR-NIN IFCT 2017 commodity entries without filling absent fields', async () => {
    const { IfctRegistry } = await import('../src/modules/engine/ifct-registry.js');
    const wheat = IfctRegistry.getByCode('A020');
    assert.ok(wheat);
    assert.equal(wheat.name, 'Wheat, whole');
    assert.equal(wheat.group, 'CEREALS');
    assert.equal(wheat.tableCitation.table, 'IFCT 2017 — Cereals and Millets');
    assert.equal(wheat.tableCitation.page, undefined);

    const rawInput = IfctRegistry.toRawNutritionInput(wheat);
    assert.equal(rawInput.energyKcal, 321.9);
    assert.equal(rawInput.proteinG, 10.59);
    assert.equal(rawInput.carbsG, 64.72);
    assert.equal(rawInput.totalFatG, 1.47);
    assert.equal(rawInput.totalSugarG, undefined);
    assert.equal(rawInput.addedSugarG, undefined);
    assert.equal(rawInput.saturatedFatG, undefined);
    assert.equal(rawInput.transFatG, undefined);
    assert.equal(rawInput.cholesterolMg, undefined);

    const report = SourceBackedNutritionEngine.inspect(rawInput);
    assert.equal(report.status, 'SOURCE_BACKED');
    assert.equal(report.completeForEvaluation, true);
    assert.equal(report.unsupportedFields.length, 0);
    assert.equal(report.missingFields.length, 0);

    // If evaluated under PACKAGED_PRODUCT context, IFCT evidence is not permitted for packaged products
    const asPackaged = SourceBackedNutritionEngine.inspect({ ...rawInput, nutritionContext: 'PACKAGED_PRODUCT' });
    assert.equal(asPackaged.status, 'UNSUPPORTED');
    assert.equal(asPackaged.completeForEvaluation, false);
    assert.ok(asPackaged.unsupportedFields.length > 0);
  });

  test('does not use IFCT composition rows to fill a packaged-product label gap', () => {
    const evidence = labelEvidence(ALL_REQUIRED_FIELDS.filter((field) => field !== 'proteinG'));
    evidence.proteinG = {
      kind: 'OFFICIAL_RESEARCH_TABLE',
      sourceId: 'ICMR_NIN_IFCT_2017',
      sourceTitle: 'ICMR-NIN Indian Food Composition Tables 2017',
      publisher: 'ICMR - National Institute of Nutrition, Hyderabad',
      basis: 'PER_100G',
      locator: 'IFCT_2017:A020:proteinG',
      verificationStatus: 'VERIFIED',
    };

    const report = SourceBackedNutritionEngine.inspect(completeVerifiedRaw({ nutritionEvidence: evidence }));
    assert.ok(report.unsupportedFields.includes('proteinG'));
    assert.equal(report.completeForEvaluation, false);
  });

  test('keeps IFCT fat and carbohydrate columns in their published order', async () => {
    const { IfctRegistry } = await import('../src/modules/engine/ifct-registry.js');
    const groundnut = IfctRegistry.getByCode('H012');
    assert.ok(groundnut);
    assert.equal(groundnut.name, 'Groundnut, with skin');
    assert.equal(groundnut.per100gEdible.energyKcal, 520.1);
    assert.equal(groundnut.per100gEdible.proteinG, 23.65);
    assert.equal(groundnut.per100gEdible.totalFatG, 39.63);
    assert.equal(groundnut.per100gEdible.carbsG, 17.27);
    assert.equal(groundnut.per100gEdible.dietaryFiberG, 10.38);
    assert.equal(groundnut.per100gEdible.sodiumMg, 12.21);
  });

  test('unverified seed fixtures cannot receive a grade or a green badge', async () => {
    const { SEED_PRODUCTS } = await import('../src/modules/products/seed-products.js');
    const maggi = SEED_PRODUCTS.find((p) => p.barcodeGtin === '8901058862492')!;
    assert.ok(maggi);
    assert.equal(maggi.isVerified, false);

    const report = SourceBackedNutritionEngine.inspect(maggi);
    assert.equal(report.completeForEvaluation, false);
    assert.equal(report.status, 'UNSUPPORTED');

    const evaluation = EvaluationService.evaluate(maggi);
    assert.equal(evaluation.isGraded, false);
    assert.equal(evaluation.frequencyGrade, 'NOT_EVALUABLE');
    assert.equal(evaluation.evaluability.canShowGrade, false);
    assert.ok(!evaluation.badgeLabel.includes('🟢'));
  });
});
