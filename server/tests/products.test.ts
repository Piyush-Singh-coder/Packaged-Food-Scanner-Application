import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { storedProductToRawInput } from '../src/modules/products/products.service.js';
import { SourceBackedNutritionEngine } from '../src/modules/engine/source-backed-engine.js';
import type { Product } from '../src/db/schema/products.js';
import type { NutritionEvidenceMap, NutritionField } from '../src/modules/engine/types.js';

const STORED_REQUIRED_FIELDS: NutritionField[] = [
  'energyKcal',
  'proteinG',
  'carbsG',
  'totalSugarG',
  'addedSugarG',
  'totalFatG',
  'saturatedFatG',
  'transFatG',
  'cholesterolMg',
];

function storedEvidence(fields: NutritionField[]): NutritionEvidenceMap {
  return Object.fromEntries(fields.map((field) => [field, {
    kind: 'MANUFACTURER_LABEL',
    sourceId: 'PACK_PHOTO:8905550000017:reviewed',
    sourceTitle: 'Reviewed manufacturer nutrition panel',
    publisher: 'Packaged-food manufacturer',
    basis: 'PER_100G',
    locator: `nutrition-table:${field}`,
    artifactHash: 'sha256:1152fd9c2d423f6e8f11d8b6e8a1f5b9',
    capturedAt: '2026-02-01T09:00:00.000Z',
    verificationStatus: 'VERIFIED',
  }]));
}

function storedRow(overrides: Partial<Product> = {}): Product {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    barcodeGtin: '8905550000017',
    productName: 'Test product',
    brandName: 'Test brand',
    categorySlug: 'Biscuits & Cookies',
    subcategorySlug: 'Biscuits',
    form: 'SOLID',
    nutritionBasis: 'PER_100G',
    servingSizeG: '30',
    packageWeightG: '100',
    mrpInr: '50',
    energyKcal100g: '400',
    proteinG100g: '5',
    carbsG100g: '60',
    totalSugar100g: '10',
    addedSugar100g: '5',
    addedFat100g: null,
    totalFat100g: '10',
    saturatedFat100g: '2',
    transFat100g: '0.1',
    cholesterolMg100g: '0',
    sodiumMg100g: '200',
    saltG100g: '0.50',
    dietaryFiber100g: null,
    ingredientsRawText: 'Wheat flour, sugar, salt',
    nutritionEvidence: {},
    isVerified: true,
    dataProvenance: 'MANUFACTURER_LABEL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

test('stored sodium-only evidence survives a database round-trip as a graded input', () => {
  const raw = storedProductToRawInput(storedRow({
    nutritionEvidence: storedEvidence([...STORED_REQUIRED_FIELDS, 'sodiumMg']),
  }));
  const report = SourceBackedNutritionEngine.inspect(raw);

  assert.equal(raw.saltG, undefined);
  assert.equal(raw.sodiumMg, 200);
  assert.equal(report.completeForEvaluation, true);
});

test('stored salt-only evidence derives sodium without treating it as declared', () => {
  const raw = storedProductToRawInput(storedRow({
    nutritionEvidence: storedEvidence([...STORED_REQUIRED_FIELDS, 'saltG']),
  }));
  const report = SourceBackedNutritionEngine.inspect(raw);

  assert.equal(raw.sodiumMg, undefined);
  assert.equal(raw.saltG, 0.5);
  assert.equal(report.completeForEvaluation, true);
});

test('a stored sodium/salt inconsistency remains unverified rather than being repaired', () => {
  const raw = storedProductToRawInput(storedRow({
    sodiumMg100g: '300',
    nutritionEvidence: storedEvidence([...STORED_REQUIRED_FIELDS, 'saltG']),
  }));
  const report = SourceBackedNutritionEngine.inspect(raw);

  assert.equal(raw.sodiumMg, 300);
  assert.equal(raw.saltG, 0.5);
  assert.ok(report.unsupportedFields.includes('sodiumMg'));
  assert.equal(report.completeForEvaluation, false);
});

describe('Products & Scientific Decision Engine API', () => {
  let app: FastifyInstance;
  let authToken = '';

  before(async () => {
    app = await buildApp();

    const authRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/guest',
      payload: { deviceId: 'test-device-uuid-112233' },
    });
    const authJson = JSON.parse(authRes.body);
    authToken = authJson.data.tokens.accessToken;
  });

  after(async () => {
    await app.close();
  });

  describe('1. Unverified seed lookup (Maggi Noodles)', () => {
    test('GET /api/v1/products/barcode/8901058862492 returns facts but no grade', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/barcode/8901058862492',
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);

      const { product, evaluation } = json.data;
      assert.strictEqual(product.productName, '2-Minute Masala Noodles');
      assert.strictEqual(product.brandName, 'Maggi');
      assert.strictEqual(product.form, 'SOLID');
      assert.strictEqual(product.isVerified, false);

      assert.equal(evaluation.sourceIntegrity.completeForEvaluation, false);
      assert.equal(evaluation.evaluability.canShowGrade, false);
      assert.equal(evaluation.frequencyGrade, 'NOT_EVALUABLE');
      assert.ok(evaluation.badgeLabel.includes('NOT ENOUGH'));

      // Advisory threshold checks are still shown as diagnostics, not as a grade.
      const saltCheck = evaluation.table151HfssChecks.find((c: any) => c.nutrient === 'Salt');
      assert.ok(saltCheck);
      assert.strictEqual(saltCheck.isBreached, true);

      // No persona may be marked green or red from an unverified fixture.
      for (const verdict of evaluation.familyVerdicts) {
        assert.strictEqual(verdict.status, 'INSUFFICIENT_DATA');
      }

      // Ingredient decoding remains independent of nutrient verification.
      assert.ok(evaluation.ingredientsAnalysis.classifiedCount > 0);
      assert.ok(evaluation.ingredientsAnalysis.coveragePercent > 50);
    });
  });

  describe('2. High-sugar unverified fixture (Britannia Bourbon Biscuits)', () => {
    test('GET /api/v1/products/barcode/8901063012844 calculates teaspoons but withholds health verdicts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/barcode/8901063012844',
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      const { product, evaluation } = json.data;

      assert.equal(product.isVerified, false);
      assert.equal(evaluation.isGraded, false);
      assert.equal(evaluation.evaluability.status, 'SOURCE_UNVERIFIED');

      // Teaspoon conversion is a display transformation of the declared value.
      assert.strictEqual(evaluation.visualizers.sugarTeaspoonsPerServing, 2.2);
      assert.strictEqual(evaluation.visualizers.sugarTeaspoonsWholePack, 10.9);

      const diabetic = evaluation.familyVerdicts.find((v: any) => v.personaId === 'DIABETIC');
      assert.ok(diabetic);
      assert.strictEqual(diabetic.status, 'INSUFFICIENT_DATA');
      assert.ok(!diabetic.reason.includes('4g'));

      const infant = evaluation.familyVerdicts.find((v: any) => v.personaId === 'INFANT_UNDER_2');
      assert.ok(infant);
      assert.strictEqual(infant.status, 'INSUFFICIENT_DATA');

      const leavening = evaluation.ingredientsAnalysis.decoded.find((d: any) => d.insCode && d.insCode.startsWith('500'));
      assert.ok(leavening);
      assert.strictEqual(leavening.isWarning, false);
    });
  });

  describe('3. Unverified liquid fixture (Amul Taaza Toned Milk)', () => {
    test('GET /api/v1/products/barcode/8901262010054 withholds infant green verdict', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/barcode/8901262010054',
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      const { product, evaluation } = json.data;

      assert.equal(product.isVerified, false);
      assert.equal(evaluation.isGraded, false);
      assert.equal(evaluation.evaluability.canShowGrade, false);
      assert.strictEqual(evaluation.visualizers.sugarTeaspoonsPerServing, 0);

      const infant = evaluation.familyVerdicts.find((v: any) => v.personaId === 'INFANT_UNDER_2');
      assert.ok(infant);
      assert.strictEqual(infant.status, 'INSUFFICIENT_DATA');
    });
  });

  describe('4. Edge cases: corrupted barcodes and missing products', () => {
    test('rejects corrupted check digit with 422 validation error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/barcode/8901058862493',
      });

      assert.strictEqual(response.statusCode, 422);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'VALIDATION_ERROR');
    });

    test('returns 404 with structured OCR fallback instructions for unlisted barcode', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products/barcode/8901234567890',
      });

      assert.strictEqual(response.statusCode, 404);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'NOT_FOUND');
      assert.strictEqual(json.details.requiresOcrFallback, true);
      assert.ok(json.message.includes('not found in catalog'));
    });
  });

  describe('5. Search & pagination', () => {
    test('GET /api/v1/products?q=bourbon returns matching unverified fixtures', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/products?q=bourbon',
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.ok(json.data.items.length >= 1);
      assert.ok(json.data.items[0].productName.includes('Bourbon'));
      assert.strictEqual(json.data.items[0].isVerified, false);
      assert.strictEqual(json.data.pagination.page, 1);
    });
  });

  describe('6. Protected product creation', () => {
    test('rejects a guest attempt before any plausibility evaluation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          barcodeGtin: '8901234567890',
          productName: 'Impossible Biscuit',
          brandName: 'Fake Brand',
          categorySlug: 'biscuits',
          subcategorySlug: 'cookies',
          form: 'SOLID',
          nutritionBasis: 'PER_100G',
          packageWeightG: 100,
          servingSizeG: 20,
          mrpInr: 50,
          energyKcal100g: 400,
          proteinG100g: 50,
          carbsG100g: 80,
          totalSugarG100g: 20,
          totalFatG100g: 30,
          saturatedFatG100g: 10,
          transFatG100g: 0,
          ingredientsRawText: 'Wheat flour, sugar, oil',
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'FORBIDDEN');
    });
  });
});
