import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import type { NutritionEvidenceMap, NutritionField } from '../src/modules/engine/types.js';

function validEan13(prefix12: string): string {
  const digits = prefix12.padEnd(12, '0').slice(0, 12).split('').map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return `${prefix12}${String((10 - (sum % 10)) % 10)}`;
}

function evidenceFor(barcode: string, fields: NutritionField[]): NutritionEvidenceMap {
  return Object.fromEntries(fields.map((field) => [field, {
    kind: 'MANUFACTURER_LABEL' as const,
    sourceId: `PACK_PHOTO:${barcode}:reviewed`,
    sourceTitle: 'Reviewed manufacturer nutrition panel',
    publisher: 'Packaged-food manufacturer',
    basis: 'PER_100G' as const,
    locator: `nutrition-table:${field}`,
    artifactHash: 'sha256:1152fd9c2d423f6e8f11d8b6e8a1f5b9',
    capturedAt: '2026-02-01T09:00:00.000Z',
    verificationStatus: 'VERIFIED' as const,
  }]));
}

const REQUIRED_WITH_FIBER: NutritionField[] = [
  'energyKcal', 'proteinG', 'carbsG', 'totalSugarG', 'addedSugarG',
  'totalFatG', 'saturatedFatG', 'transFatG', 'cholesterolMg', 'sodiumMg', 'fiberG',
];

function productInput(name: string, barcode: string, overrides: Record<string, unknown> = {}) {
  return {
    barcodeGtin: barcode,
    productName: name,
    brandName: 'Verified Test Brand',
    categorySlug: 'biscuits',
    subcategorySlug: 'cookies',
    form: 'SOLID' as const,
    nutritionBasis: 'PER_100G' as const,
    packageWeightG: 100,
    servingSizeG: 25,
    mrpInr: 30,
    energyKcal100g: 400,
    proteinG100g: 6,
    carbsG100g: 65,
    totalSugarG100g: 12,
    addedSugarG100g: 8,
    totalFatG100g: 15,
    saturatedFatG100g: 5,
    transFatG100g: 0.1,
    cholesterolMg100g: 0,
    sodiumMg100g: 150,
    dietaryFiberG100g: 6,
    ingredientsRawText: 'Wheat flour, Sugar, Palm oil, Salt.',
    nutritionEvidence: evidenceFor(barcode, REQUIRED_WITH_FIBER),
    ...overrides,
  };
}

describe('Lexicographic Price-Aware Healthier Swap Engine API', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  describe('1. Seed fixtures fail closed', () => {
    test('does not rank an unverified Bourbon fixture against unverified seeds', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/swaps/8901063012844',
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isAlreadyOptimal, false);
      assert.strictEqual(json.data.swapsCount, 0);
      assert.ok(json.data.noSwapsReason.includes('not source-verified'));
      assert.equal(json.data.scannedProduct.addedSugar100g, null);
    });

    test('does not claim a Maggi fixture is already optimal', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/swaps/8901058862492',
      });

      const json = JSON.parse(response.body);
      assert.strictEqual(json.data.isAlreadyOptimal, false);
      assert.strictEqual(json.data.swapsCount, 0);
      assert.ok(json.data.noSwapsReason.includes('not source-verified'));
    });

    test('does not claim an Amul fixture is already optimal', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/swaps/8901262010054',
      });

      const json = JSON.parse(response.body);
      assert.strictEqual(json.data.isAlreadyOptimal, false);
      assert.strictEqual(json.data.swapsCount, 0);
      assert.ok(json.data.noSwapsReason.includes('not source-verified'));
    });
  });

  describe('2. Verified, complete products can be ranked', () => {
    const scannedBarcode = validEan13('890555000001');
    const bestBarcode = validEan13('890555000002');
    const highSugarBarcode = validEan13('890555000003');
    const expensiveBarcode = validEan13('890555000004');

    before(async () => {
      const { ProductsService } = await import('../src/modules/products/products.service.js');
      const service = new ProductsService();

      const results = await Promise.all([
        service.createProduct(productInput('Scanned Biscuit', scannedBarcode, {
          energyKcal100g: 480,
          proteinG100g: 6,
          carbsG100g: 65,
          totalSugarG100g: 40,
          addedSugarG100g: 30,
          totalFatG100g: 20,
          saturatedFatG100g: 10,
          sodiumMg100g: 300,
          dietaryFiberG100g: 1,
          mrpInr: 30,
        }) as any),
        service.createProduct(productInput('Oats Gluten-Free Biscuit', bestBarcode, {
          energyKcal100g: 380,
          proteinG100g: 7,
          carbsG100g: 65,
          totalSugarG100g: 5,
          addedSugarG100g: 0,
          totalFatG100g: 14,
          saturatedFatG100g: 1.5,
          sodiumMg100g: 100,
          dietaryFiberG100g: 8,
          ingredientsRawText: 'Oats, Rice flour, Almonds, Sunflower oil.',
        }) as any),
        service.createProduct(productInput('Wheat High Sugar Biscuit', highSugarBarcode, {
          energyKcal100g: 450,
          proteinG100g: 6,
          carbsG100g: 65,
          totalSugarG100g: 20,
          addedSugarG100g: 16,
          totalFatG100g: 18,
          saturatedFatG100g: 8,
          sodiumMg100g: 250,
          dietaryFiberG100g: 2,
        }) as any),
        service.createProduct(productInput('Premium Biscuit', expensiveBarcode, {
          mrpInr: 60,
          ingredientsRawText: 'Rice flour, Sugar, Sunflower oil.',
        }) as any),
      ]);

      assert.deepEqual(results.map((item) => item.isVerified), [true, true, true, true]);
    });

    test('ranks a verified lower-sugar, higher-fibre candidate and reports deltas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/swaps/${scannedBarcode}`,
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isAlreadyOptimal, false);
      assert.ok(json.data.swapsCount >= 1);

      const top = json.data.swaps[0];
      assert.strictEqual(top.barcodeGtin, bestBarcode);
      assert.strictEqual(top.addedSugar100g, 0);
      assert.equal(top.deltas.addedSugar.scannedValue, 30);
      assert.equal(top.deltas.addedSugar.candidateValue, 0);
      assert.equal(top.deltas.addedSugar.absoluteDelta, -30);
      assert.equal(top.deltas.addedSugar.isImprovement, true);
      assert.equal(top.deltas.dietaryFiber.absoluteDelta, 7);
      assert.equal(top.pricePer100g, 30);
      assert.equal(top.priceRatioVsScanned, 1);
      assert.ok(top.keyAdvantages.some((text: string) => text.includes('less added sugar')));
      assert.ok(top.hfssBreachCount > 0);
      assert.ok(top.tradeOffs.some((t: string) => t.includes('Table 15.1 threshold')));
    });

    test('excludes a price-premium candidate beyond the default ceiling', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/swaps/${scannedBarcode}`,
      });

      const json = JSON.parse(response.body);
      const premium = json.data.swaps.find((swap: any) => swap.barcodeGtin === expensiveBarcode);
      assert.equal(premium, undefined);
    });

    test('filters candidates by statutory and may-contain allergen statements', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/swaps/${scannedBarcode}?allergens=ALLERGEN_GLUTEN`,
      });

      const json = JSON.parse(response.body);
      const wheatCandidate = json.data.swaps.find((swap: any) => swap.barcodeGtin === highSugarBarcode);
      const oatsCandidate = json.data.swaps.find((swap: any) => swap.barcodeGtin === bestBarcode);
      assert.equal(wheatCandidate, undefined);
      assert.ok(oatsCandidate);
    });

    test('allows a genuinely cheaper candidate; there is no artificial 0.8 price floor', async () => {
      const cheapScanned = validEan13('890555000005');
      const cheapCandidate = validEan13('890555000006');
      const { ProductsService } = await import('../src/modules/products/products.service.js');
      const service = new ProductsService();

      await service.createProduct(productInput('Cheaper Aisle Baseline', cheapScanned, {
        categorySlug: 'cheap-test',
        mrpInr: 30,
        energyKcal100g: 480,
        addedSugarG100g: 30,
        totalSugarG100g: 40,
        saturatedFatG100g: 10,
        dietaryFiberG100g: 1,
        sodiumMg100g: 300,
      }) as any);
      await service.createProduct(productInput('Cheaper Verified Choice', cheapCandidate, {
        categorySlug: 'cheap-test',
        mrpInr: 12,
        addedSugarG100g: 0,
        totalSugarG100g: 4,
        saturatedFatG100g: 1,
        dietaryFiberG100g: 7,
        sodiumMg100g: 80,
        ingredientsRawText: 'Oats, Rice flour, Sunflower oil.',
      }) as any);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/swaps/${cheapScanned}`,
      });

      const json = JSON.parse(response.body);
      assert.strictEqual(json.data.swapsCount, 1);
      assert.strictEqual(json.data.swaps[0].barcodeGtin, cheapCandidate);
      assert.equal(json.data.swaps[0].priceRatioVsScanned, 0.4);
    });

    test('allows swaps when baseline fibre is undeclared, comparing on sugar/sodium/fat axes', async () => {
      const noFiberBarcode = validEan13('890555000007');
      const { ProductsService } = await import('../src/modules/products/products.service.js');
      const service = new ProductsService();
      const evidence = evidenceFor(noFiberBarcode, REQUIRED_WITH_FIBER.filter((field) => field !== 'fiberG'));

      const created = await service.createProduct(productInput('No Fibre Scanned Biscuit', noFiberBarcode, {
        categorySlug: 'biscuits',
        dietaryFiberG100g: undefined,
        addedSugarG100g: 25,
        sodiumMg100g: 400,
        nutritionEvidence: evidence,
      }) as any);
      assert.equal(created.isVerified, true);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/swaps/${noFiberBarcode}`,
      });

      const json = JSON.parse(response.body);
      assert.strictEqual(response.statusCode, 200);
      assert.ok(json.data.swapsCount >= 1);
      // Confirms alternative product swap works when baseline fibre is undeclared
    });
  });

  describe('3. Input validation', () => {
    test('accepts a caller-tightened price ceiling below 0.8', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/swaps/8905550000017?maxPriceRatio=0.5',
      });

      assert.strictEqual(response.statusCode, 200);
    });

    test('rejects corrupted check digit with 422', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/swaps/8901058862493',
      });

      assert.strictEqual(response.statusCode, 422);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'VALIDATION_ERROR');
    });
  });
});
