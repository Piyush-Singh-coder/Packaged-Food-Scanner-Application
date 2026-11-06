import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenFoodFactsClient } from '../src/modules/products/open-food-facts.client.js';
import { NutrientVerifier } from '../src/modules/engine/nutrient-verifier.js';
import { EvaluationService } from '../src/modules/engine/evaluation.service.js';
import { SourceBackedNutritionEngine } from '../src/modules/engine/source-backed-engine.js';
import { ProductsService } from '../src/modules/products/products.service.js';
import type { RawNutritionInput } from '../src/modules/engine/types.js';

describe('Phase 0 Architecture Hardening & Accuracy Tests', () => {
  describe('1. Open Food Facts Unit Normalization & Stoichiometric Cross-Check', () => {
    test('converts sodium_100g from grams to milligrams correctly', () => {
      const mockOff = {
        code: '8901030000011',
        product_name: 'Gram-Declared Salt Crackers',
        nutriments: {
          'energy-kcal_100g': 450,
          proteins_100g: 8.0,
          carbohydrates_100g: 65.0,
          fat_100g: 15.0,
          sodium_100g: 0.5, // 0.5 grams = 500 mg!
          sodium_unit: 'g',
          salt_100g: 1.25,  // 1.25g salt * 400 = 500mg sodium
        },
      };

      const cleansed = OpenFoodFactsClient.mapAndCleanseOpenFoodFactsProduct(mockOff);
      assert.ok(cleansed);
      assert.strictEqual(cleansed.sodiumMg, 500);
      assert.strictEqual(cleansed.saltG, 1.25);
    });

    test('converts cholesterol_100g from grams to milligrams correctly', () => {
      const mockButter = {
        code: '0034500151368',
        product_name: 'Land O Lakes Butter',
        nutriments: {
          'energy-kcal_100g': 717,
          proteins_100g: 0.8,
          carbohydrates_100g: 0.1,
          fat_100g: 81.0,
          cholesterol_100g: 0.214, // 0.214g = 214 mg!
          cholesterol_unit: 'g',
        },
      };

      const cleansed = OpenFoodFactsClient.mapAndCleanseOpenFoodFactsProduct(mockButter);
      assert.ok(cleansed);
      assert.strictEqual(cleansed.cholesterolMg, 214);
    });

    test('derives sodium from salt when sodium is absent in OFF', () => {
      const mockProduct = {
        code: '8901030000022',
        product_name: 'Salt-Only Snack',
        nutriments: {
          'energy-kcal_100g': 400,
          proteins_100g: 7.0,
          carbohydrates_100g: 60.0,
          fat_100g: 12.0,
          salt_100g: 1.0, // 1.0g salt -> 400mg sodium
        },
      };

      const cleansed = OpenFoodFactsClient.mapAndCleanseOpenFoodFactsProduct(mockProduct);
      assert.ok(cleansed);
      assert.strictEqual(cleansed.sodiumMg, 400);
    });

    test('strips physically impossible sodium values exceeding 40,000 mg / 100g', () => {
      const mockImpossible = {
        code: '8901030000033',
        product_name: 'Corrupted Sodium Item',
        nutriments: {
          'energy-kcal_100g': 300,
          proteins_100g: 5.0,
          carbohydrates_100g: 50.0,
          fat_100g: 10.0,
          sodium_100g: 50000,
          sodium_unit: 'mg',
        },
      };

      const cleansed = OpenFoodFactsClient.mapAndCleanseOpenFoodFactsProduct(mockImpossible);
      assert.ok(cleansed);
      assert.strictEqual(cleansed.sodiumMg, undefined);
    });
  });

  describe('2. Artifact Hash Validation & Untrusted Submissions Gate', () => {
    test('rejects non-hex artifact hash strings in source backed engine', () => {
      const input: RawNutritionInput = {
        productName: 'Fake Hash Product',
        brand: 'TestBrand',
        category: 'Snacks',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 300,
        proteinG: 10,
        carbsG: 40,
        totalFatG: 10,
        sodiumMg: 200,
        nutritionEvidence: {
          energyKcal: {
            kind: 'MANUFACTURER_LABEL',
            sourceId: 'PACK_PHOTO:fake',
            sourceTitle: 'Label',
            publisher: 'Mfr',
            basis: 'PER_100G',
            locator: 'table:energy',
            artifactHash: 'invalid-non-hex-hash-value',
            capturedAt: '2026-01-01',
            verificationStatus: 'VERIFIED',
          },
        },
      };

      const report = SourceBackedNutritionEngine.inspect(input);
      assert.strictEqual(report.unsupportedFields.includes('energyKcal'), true);
    });

    test('untrusted submission cannot self-declare VERIFIED status', async () => {
      const service = new ProductsService();
      const submission = {
        barcodeGtin: '8901030999994',
        productName: 'Self-Declared Verified Item',
        brandName: 'Brand',
        categorySlug: 'biscuits',
        subcategorySlug: 'cookies',
        form: 'SOLID' as const,
        nutritionBasis: 'PER_100G' as const,
        packageWeightG: 100,
        servingSizeG: 25,
        mrpInr: 50,
        energyKcal100g: 450,
        proteinG100g: 6,
        carbsG100g: 65,
        totalSugarG100g: 20,
        addedSugarG100g: 15,
        totalFatG100g: 18,
        saturatedFatG100g: 8,
        transFatG100g: 0.1,
        cholesterolMg100g: 5,
        sodiumMg100g: 250,
        ingredientsRawText: 'Wheat flour, Sugar, Palm oil, Salt.',
        nutritionEvidence: {
          energyKcal: {
            kind: 'MANUFACTURER_LABEL',
            sourceId: 'PACK_PHOTO:test',
            sourceTitle: 'Pack',
            publisher: 'Mfr',
            basis: 'PER_100G',
            locator: 'energy',
            artifactHash: 'sha256:1152fd9c2d423f6e8f11d8b6e8a1f5b91152fd9c2d423f6e8f11d8b6e8a1f5b9',
            capturedAt: '2026-01-01',
            verificationStatus: 'VERIFIED' as const,
          },
        },
      };

      const result = await service.createProduct(submission as any, { isTrusted: false });
      assert.strictEqual(result.isVerified, false);
      assert.strictEqual(result.dataProvenance, 'USER_CONTRIBUTED_PENDING');
    });
  });

  describe('3. Macronutrient Mass Balance & Physical Limits', () => {
    test('enforces pure macronutrient sum <= 100.0g without mineral sodium distortion', () => {
      // 15g protein + 70g carbs + 15g fat = 100.0g (boundary case, valid low-moisture biscuit)
      const boundaryValid = NutrientVerifier.normalize({
        productName: 'Dry Biscuit',
        brand: 'Test',
        category: 'Biscuits',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 475,
        proteinG: 15.0,
        carbsG: 70.0,
        totalFatG: 15.0,
        sodiumMg: 800, // 0.8g sodium - must not push 100g to 100.8g!
      });

      const audit = NutrientVerifier.auditConsistency(boundaryValid);
      assert.strictEqual(audit.massConservation.passed, true);
      assert.strictEqual(audit.massConservation.totalMacroGramsPer100g, 100.0);
    });

    test('marks CORRUPT when macronutrients exceed 100.0g', () => {
      const overMass = NutrientVerifier.normalize({
        productName: 'Impossible Bar',
        brand: 'Test',
        category: 'Snacks',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 500,
        proteinG: 20.0,
        carbsG: 60.0,
        totalFatG: 21.0, // 20 + 60 + 21 = 101.0g > 100.0g
      });

      const audit = NutrientVerifier.auditConsistency(overMass);
      assert.strictEqual(audit.massConservation.passed, false);
      assert.strictEqual(audit.overallConfidence, 'CORRUPT');
    });
  });

  describe('4. Fat-Material Categories False-Green Prevention', () => {
    test('caps grade at ENJOY_IN_MODERATION when total fat > 15g in snacks and added fat is undeclared', () => {
      const bhujiaSnack: RawNutritionInput = {
        productName: 'Bikaneri Bhujia Snack',
        brand: 'Haldiram',
        category: 'Namkeen',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 244, // <= 250 kcal cutoff (not breached)
        proteinG: 8.0,
        carbsG: 18.0,
        totalSugarG: 1.0,
        addedSugarG: 0,   // 0 breaches on sugar (<= 3g)
        totalFatG: 15.5,  // > 15g!
        saturatedFatG: 0.8, // 0.8 * 9 / 244 = 2.95% energy <= 5% (not breached)
        transFatG: 0,
        cholesterolMg: 0,
        sodiumMg: 150,   // Low sodium (<= 625mg salt eq), not breached
        saltG: 0.375,
        // addedFatG is undefined / null (undeclared on standard Indian label)
        nutritionEvidence: {
          energyKcal: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l1', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          proteinG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l2', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          carbsG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l3', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          totalSugarG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l4', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          addedSugarG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l5', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          totalFatG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l6', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          saturatedFatG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l7', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          transFatG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l8', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          cholesterolMg: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l9', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          sodiumMg: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l10', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          saltG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:1', sourceTitle: 'P', publisher: 'M', basis: 'PER_100G', locator: 'l11', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
        },
      };

      const result = EvaluationService.evaluate(bhujiaSnack);
      assert.strictEqual(result.isGraded, true);
      // Must not receive green badge because high total fat implies high added fat in fried namkeen
      assert.strictEqual(result.frequencyGrade, 'ENJOY_IN_MODERATION');
      assert.strictEqual(result.badgeLabel, '🟡 PARTIAL ASSESSMENT — ADDED FAT NOT DECLARED');
      assert.ok(result.whySummary.some((w) => w.includes('added fat is not separately declared')));
    });
  });
});
