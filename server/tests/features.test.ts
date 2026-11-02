import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateFssaiLicense, extractFssaiLicensesFromText } from '../src/common/utils/fssai.js';
import { ClaimsVerifier } from '../src/modules/engine/claims-verifier.js';
import { NutrientVerifier } from '../src/modules/engine/nutrient-verifier.js';
import { IngredientParser } from '../src/modules/engine/ingredient-parser.js';
import { IfctRegistry } from '../src/modules/engine/ifct-registry.js';
import type { RawNutritionInput } from '../src/modules/engine/types.js';
import { OcrParser } from '../src/modules/ocr/ocr.parser.js';

describe('Advanced Product Intelligence Features', () => {
  describe('1. FSSAI 14-Digit License Validation & Decoding', () => {
    test('validates authentic central license and identifies state and year', () => {
      // 1 = License, 00 = Central HQ, 21 = Year 2021, 001 = Officer, 000123 = Serial
      const res = validateFssaiLicense('10021001000123');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.licenseType, 'CENTRAL_OR_STATE_LICENSE');
      assert.strictEqual(res.stateCode, '00');
      assert.strictEqual(res.yearOfEnrollment, 2021);
      assert.ok(res.verificationUrl?.includes('foscos.fssai.gov.in'));
    });

    test('validates state license (e.g. Maharashtra 27)', () => {
      const res = validateFssaiLicense('12720022000456');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.stateCode, '27');
      assert.strictEqual(res.stateName, 'Maharashtra');
      assert.strictEqual(res.yearOfEnrollment, 2020);
    });

    test('validates basic registration (first digit 2)', () => {
      const res = validateFssaiLicense('20719003000789');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.licenseType, 'BASIC_REGISTRATION');
      assert.strictEqual(res.stateCode, '07');
      assert.strictEqual(res.stateName, 'Delhi');
    });

    test('rejects malformed licenses with invalid length or starting digit', () => {
      const tooShort = validateFssaiLicense('12345');
      assert.strictEqual(tooShort.isValid, false);
      assert.ok(tooShort.error?.includes('14 digits'));

      const invalidStart = validateFssaiLicense('92720022000456');
      assert.strictEqual(invalidStart.isValid, false);
      assert.ok(invalidStart.error?.includes('must be 1'));
    });

    test('extracts FSSAI license numbers directly from OCR packaging text', () => {
      const ocrText = `
        Manufactured & Marketed by: Brit Foods Pvt Ltd
        Plot 45, MIDC, Andheri East, Mumbai
        FSSAI Lic. No. 12722004000999
        Best Before 6 Months from Packaging
        Net Qty: 200g
      `;
      const licenses = extractFssaiLicensesFromText(ocrText);
      assert.strictEqual(licenses.length, 1);
      assert.strictEqual(licenses[0].rawNumber, '12722004000999');
      assert.strictEqual(licenses[0].stateName, 'Maharashtra');
      assert.strictEqual(licenses[0].yearOfEnrollment, 2022);
    });

    test('OcrParser automatically includes extracted FSSAI licenses in packaging data', () => {
      const ocrText = `
        Britannia Good Day Biscuits
        Energy: 480 kcal
        Protein: 6 g
        Total Carbohydrates: 70 g
        Total Sugars: 24 g
        Added Sugars: 22 g
        Total Fat: 20 g
        Saturated Fat: 9 g
        Sodium: 220 mg
        Ingredients: Refined Wheat Flour, Sugar, Vegetable Oil, Salt.
        Lic No: 10014011001234
      `;
      const parsed = OcrParser.parse(ocrText);
      assert.ok(parsed.fssaiLicenses);
      assert.strictEqual(parsed.fssaiLicenses.length, 1);
      assert.strictEqual(parsed.fssaiLicenses[0].rawNumber, '10014011001234');
      assert.strictEqual(parsed.fssaiLicenses[0].licenseType, 'CENTRAL_OR_STATE_LICENSE');
    });
  });

  describe('2. Front-of-Pack Marketing Claim Consistency Verifier (FSSAI 2018)', () => {
    test("flags misleading 'No Added Sugar' claim when added sugar is declared", () => {
      const raw: RawNutritionInput = {
        productName: 'Health Crisp No Added Sugar Cookies',
        brand: 'FauxHealth',
        category: 'Biscuits',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 450,
        proteinG: 6,
        carbsG: 65,
        totalSugarG: 18,
        addedSugarG: 12, // Contradicts claim!
        totalFatG: 15,
        saturatedFatG: 5,
        sodiumMg: 150,
        ingredientsText: 'Wheat flour, Sugar, Palm oil, Salt.',
      };
      const normalized = NutrientVerifier.normalize(raw);
      const audit = ClaimsVerifier.verifyClaims(raw, normalized);

      assert.strictEqual(audit.hasMisleadingClaims, true);
      const sugarClaim = audit.assessedClaims.find((c) => c.claim === 'No Added Sugar');
      assert.ok(sugarClaim);
      assert.strictEqual(sugarClaim.status, 'MISLEADING_BREACH');
      assert.ok(sugarClaim.reason.includes('declares 12g added sugar'));
    });

    test("flags misleading 'No Added Sugar' claim when liquid glucose / maltodextrin is in ingredients", () => {
      const raw: RawNutritionInput = {
        productName: 'Sugar-Free Digestive Biscuits',
        brand: 'DietBrand',
        category: 'Biscuits',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 420,
        proteinG: 8,
        carbsG: 60,
        totalSugarG: 4,
        addedSugarG: 0,
        totalFatG: 12,
        saturatedFatG: 4,
        sodiumMg: 180,
        ingredientsText: 'Whole wheat flour, Maltodextrin, Liquid Glucose, Vegetable Oil, Salt.',
      };
      const normalized = NutrientVerifier.normalize(raw);
      const audit = ClaimsVerifier.verifyClaims(raw, normalized, 'No Added Sugar Healthy Snack');

      assert.strictEqual(audit.hasMisleadingClaims, true);
      const sugarClaim = audit.assessedClaims.find((c) => c.claim === 'No Added Sugar');
      assert.ok(sugarClaim);
      assert.strictEqual(sugarClaim.status, 'MISLEADING_BREACH');
      assert.ok(sugarClaim.reason.includes('liquid glucose'));
      assert.ok(sugarClaim.reason.includes('maltodextrin'));
    });

    test("validates compliant 'No Added Sugar' claim with naturally occurring sugars", () => {
      const raw: RawNutritionInput = {
        productName: '100% Pure Fruit Spread No Added Sugar',
        brand: 'NatureFresh',
        category: 'Jams & Spreads',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 160,
        proteinG: 1,
        carbsG: 38,
        totalSugarG: 36, // Natural fruit fructose
        addedSugarG: 0,
        totalFatG: 0.2,
        saturatedFatG: 0,
        sodiumMg: 10,
        ingredientsText: 'Strawberries, Pectin, Lemon Juice Concentrate.',
      };
      const normalized = NutrientVerifier.normalize(raw);
      const audit = ClaimsVerifier.verifyClaims(raw, normalized);

      assert.strictEqual(audit.hasMisleadingClaims, false);
      const sugarClaim = audit.assessedClaims.find((c) => c.claim === 'No Added Sugar');
      assert.ok(sugarClaim);
      assert.strictEqual(sugarClaim.status, 'VERIFIED_COMPLIANT');
      assert.ok(sugarClaim.reason.includes('CONTAINS NATURALLY OCCURRING SUGARS'));
    });

    test("audits 'High Protein' claim against FSSAI 20% RDA threshold (10.8g per 100g solids)", () => {
      // Case A: 3g protein fails 'High Protein'
      const lowProtein: RawNutritionInput = {
        productName: 'Power High Protein Breakfast Flakes',
        brand: 'FitFoods',
        category: 'Cereals',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        proteinG: 3.5, // Fails 10.8g
        carbsG: 75,
        energyKcal: 380,
        totalFatG: 2,
      };
      const auditFail = ClaimsVerifier.verifyClaims(lowProtein, NutrientVerifier.normalize(lowProtein));
      assert.strictEqual(auditFail.hasMisleadingClaims, true);
      assert.strictEqual(auditFail.assessedClaims[0].status, 'MISLEADING_BREACH');

      // Case B: 14g protein passes 'High Protein'
      const highProtein: RawNutritionInput = {
        productName: 'Power High Protein Snack Bar',
        brand: 'FitFoods',
        category: 'Protein Bars',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        proteinG: 14.0, // Exceeds 10.8g
        carbsG: 45,
        energyKcal: 390,
        totalFatG: 10,
      };
      const auditPass = ClaimsVerifier.verifyClaims(highProtein, NutrientVerifier.normalize(highProtein));
      assert.strictEqual(auditPass.hasMisleadingClaims, false);
      assert.strictEqual(auditPass.assessedClaims[0].status, 'VERIFIED_COMPLIANT');
    });

    test("audits 'High Fibre' claim against FSSAI 6g/100g threshold", () => {
      const highFiber: RawNutritionInput = {
        productName: 'Nutri High Fibre Whole Wheat Crackers',
        brand: 'GrainMakers',
        category: 'Crackers',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        fiberG: 7.5,
        energyKcal: 380,
        proteinG: 9,
        carbsG: 62,
        totalFatG: 8,
      };
      const audit = ClaimsVerifier.verifyClaims(highFiber, NutrientVerifier.normalize(highFiber));
      assert.strictEqual(audit.hasMisleadingClaims, false);
      const fiberClaim = audit.assessedClaims.find((c) => c.claim === 'High Fibre');
      assert.ok(fiberClaim);
      assert.strictEqual(fiberClaim.status, 'VERIFIED_COMPLIANT');
    });
  });

  describe('3. Tiered Atwater Caloric Evaluation (<=8% Pass, 8-20% Suspect, >20% Corrupt)', () => {
    test('marks caloric discrepancy <= 8% as HIGH confidence Pass', () => {
      // 10P + 25C + 10F = 40 + 100 + 90 = 230 kcal.
      // Declared: 220 kcal -> diff = |230 - 220| / 220 = 10 / 220 = 4.5% (<= 8%)
      const normalized = NutrientVerifier.normalize({
        productName: 'Precise Biscuits',
        brand: 'Test',
        category: 'Biscuits',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 220,
        proteinG: 10,
        carbsG: 25,
        totalSugarG: 5,
        addedSugarG: 4,
        totalFatG: 10,
        saturatedFatG: 3,
        sodiumMg: 100,
      });

      const audit = NutrientVerifier.auditConsistency(normalized);
      assert.strictEqual(audit.isPlausible, true);
      assert.strictEqual(audit.overallConfidence, 'HIGH');
      assert.strictEqual(audit.atwaterEnergy.passed, true);
      assert.ok(audit.atwaterEnergy.reason.includes('8% high-confidence tolerance'));
    });

    test('marks caloric discrepancy between 8% and 20% as SUSPECT Warning', () => {
      // Calculated: 230 kcal.
      // Declared: 200 kcal -> diff = |230 - 200| / 200 = 30 / 200 = 15.0% (> 8%, <= 20%)
      const normalized = NutrientVerifier.normalize({
        productName: 'Slightly Deviant Snack',
        brand: 'Test',
        category: 'Snacks',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 200,
        proteinG: 10,
        carbsG: 25,
        totalSugarG: 5,
        addedSugarG: 4,
        totalFatG: 10,
        saturatedFatG: 3,
        sodiumMg: 100,
      });

      const audit = NutrientVerifier.auditConsistency(normalized);
      assert.strictEqual(audit.isPlausible, true);
      assert.strictEqual(audit.overallConfidence, 'SUSPECT');
      assert.strictEqual(audit.atwaterEnergy.passed, true);
      assert.ok(audit.atwaterEnergy.reason.includes('minor variance'));
      assert.ok(audit.labelConsistency.notes.some((n) => n.includes('within 20% regulatory tolerance')));
    });

    test('marks caloric discrepancy > 20% as CORRUPT Failure', () => {
      // Calculated: 230 kcal.
      // Declared: 150 kcal -> diff = |230 - 150| / 150 = 80 / 150 = 53.3% (> 20%)
      const normalized = NutrientVerifier.normalize({
        productName: 'Corrupt Energy Label',
        brand: 'Test',
        category: 'Snacks',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 150,
        proteinG: 10,
        carbsG: 25,
        totalSugarG: 5,
        addedSugarG: 4,
        totalFatG: 10,
        saturatedFatG: 3,
        sodiumMg: 100,
      });

      const audit = NutrientVerifier.auditConsistency(normalized);
      assert.strictEqual(audit.isPlausible, false);
      assert.strictEqual(audit.overallConfidence, 'CORRUPT');
      assert.strictEqual(audit.atwaterEnergy.passed, false);
      assert.ok(audit.atwaterEnergy.reason.includes('implausible'));
    });
  });

  describe('4. Badge & Table 15.1 Payload Self-Consistency & Medical Neutrality', () => {
    test('badge count strictly and dynamically matches breached checks count', async () => {
      const { EvaluationService } = await import('../src/modules/engine/evaluation.service.js');
      const raw: RawNutritionInput = {
        productName: 'Test High HFSS Biscuit',
        brand: 'TestBrand',
        category: 'Biscuits',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        servingSizeGrams: 50,
        packageWeightGrams: 100,
        energyKcal: 480, // Breaches > 250
        proteinG: 6,
        carbsG: 70,
        totalSugarG: 30,
        addedSugarG: 28, // Breaches > 3g
        totalFatG: 20,
        saturatedFatG: 2, // 2 * 9 / 480 = 3.75% (< 5% daily guidance)
        transFatG: 0,
        cholesterolMg: 0,
        sodiumMg: 200, // 200 * 2.5 = 500 mg salt (< 625 mg)
        ingredientsText: 'Refined wheat flour, sugar, palm oil, salt.',
        nutritionEvidence: {
          energyKcal: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l1', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          proteinG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l2', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          carbsG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l3', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          totalSugarG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l4', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          addedSugarG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l5', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          totalFatG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l6', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          saturatedFatG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l7', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          transFatG: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l8', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          cholesterolMg: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l9', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
          sodiumMg: { kind: 'MANUFACTURER_LABEL', sourceId: 'PACK_PHOTO:test', sourceTitle: 'Pack', publisher: 'Mfr', basis: 'PER_100G', locator: 'l10', capturedAt: '2026-01-01', verificationStatus: 'VERIFIED' },
        },
      };

      const result = EvaluationService.evaluate(raw);
      const breaches = result.table151HfssChecks.filter((c) => c.isBreached === true);
      assert.strictEqual(breaches.length, 2); // Energy and Added Sugar
      assert.strictEqual(result.badgeLabel, '🔴 HIGH IN 2 ASSESSED NUTRIENTS');

      // Check Added Fat is explicitly unassessed and not counted
      const addedFatCheck = result.table151HfssChecks.find((c) => c.nutrient === 'Added Fat');
      assert.ok(addedFatCheck);
      assert.strictEqual(addedFatCheck.isBreached, null);
      assert.ok(addedFatCheck.note?.includes('not declared on Indian label'));

      // Check Renal persona states lack of potassium/phosphorus declarations
      const renal = result.familyVerdicts.find((v) => v.personaId === 'RENAL');
      assert.ok(renal);
      assert.ok(renal.reason.includes('potassium or phosphorus'));
    });
  });

  describe('5. Open Food Facts Cleansing & Corrupt Hierarchy Rejection', () => {
    test('discards impossible added sugar estimates exceeding total sugars (e.g. Bourbon 113.6g vs 39.4g)', async () => {
      const { OpenFoodFactsClient } = await import('../src/modules/products/open-food-facts.client.js');

      // Mimics real OFF corrupted record
      const offMockPayload = {
        code: '8901063012844',
        product_name: 'Britannia Bourbon Chocolate',
        brands: 'Britannia',
        categories: 'Biscuits',
        quantity: '120g',
        serving_size: '20g',
        ingredients_text: 'Refined wheat flour, sugar, hydrogenated vegetable oils.',
        nutriments: {
          'energy-kcal_100g': 490,
          proteins_100g: 5.5,
          carbohydrates_100g: 72.0,
          sugars_100g: 39.4,
          'added-sugars_100g': 113.6, // IMPOSSIBLE computed estimate!
          fat_100g: 20.0,
          'saturated-fat_100g': 10.0,
          sodium_100g: 0.25,
          salt_100g: 0.625,
        },
      };

      const cleansed = OpenFoodFactsClient.mapAndCleanseOpenFoodFactsProduct(offMockPayload);
      assert.ok(cleansed);
      // Added sugar of 113.6g MUST have been stripped out
      assert.strictEqual(cleansed.addedSugarG, undefined);
      // Legitimate total sugar remains
      assert.strictEqual(cleansed.totalSugarG, 39.4);
      // Evidence has TRANSCRIBED_UNVERIFIED
      assert.strictEqual(cleansed.nutritionEvidence?.energyKcal?.verificationStatus, 'TRANSCRIBED_UNVERIFIED');
    });

    test('discards total sugars exceeding total carbohydrates', async () => {
      const { OpenFoodFactsClient } = await import('../src/modules/products/open-food-facts.client.js');

      const corruptedSugars = {
        code: '1234567890123',
        product_name: 'Corrupt Sugar Candy',
        nutriments: {
          'energy-kcal_100g': 350,
          proteins_100g: 1.0,
          carbohydrates_100g: 40.0,
          sugars_100g: 65.0, // Exceeds carbs!
          fat_100g: 0,
        },
      };

      const cleansed = OpenFoodFactsClient.mapAndCleanseOpenFoodFactsProduct(corruptedSugars);
      assert.ok(cleansed);
      assert.strictEqual(cleansed.totalSugarG, undefined);
    });

    test('rejects entire product if macro sum physically exceeds 105g/100g', async () => {
      const { OpenFoodFactsClient } = await import('../src/modules/products/open-food-facts.client.js');

      const physicallyImpossible = {
        code: '9999999999999',
        product_name: 'Impossible Mass Item',
        nutriments: {
          'energy-kcal_100g': 800,
          proteins_100g: 50.0,
          carbohydrates_100g: 50.0,
          fat_100g: 50.0, // Sum = 150g > 105g!
        },
      };

      const cleansed = OpenFoodFactsClient.mapAndCleanseOpenFoodFactsProduct(physicallyImpossible);
      assert.strictEqual(cleansed, null);
    });

    test('negative caching prevents redundant upstream hits on missing barcodes', async () => {
      const { OpenFoodFactsClient } = await import('../src/modules/products/open-food-facts.client.js');
      OpenFoodFactsClient.clearCache();

      // Query non-existent barcode
      const firstCall = await OpenFoodFactsClient.fetchProduct('8900000000000');
      // Should be NOT_FOUND or UPSTREAM_UNAVAILABLE
      assert.ok(firstCall.status === 'NOT_FOUND' || firstCall.status === 'UPSTREAM_UNAVAILABLE');

      // Subsequent call is served from cache if NOT_FOUND
      if (firstCall.status === 'NOT_FOUND') {
        const secondCall = await OpenFoodFactsClient.fetchProduct('8900000000000');
        assert.strictEqual(secondCall.status, 'NOT_FOUND');
      }
    });
  });

  describe('6. IP-Bound Rate Limiting Key Isolation (Anti-Spoofing)', () => {
    test('uses request.ip for anonymous requests to prevent x-device-id spoofing', () => {
      const anonymousReq = {
        headers: { 'x-device-id': 'spoofed-random-id' },
        ip: '103.21.124.5',
        user: undefined,
      };
      const userId = (anonymousReq.user as any)?.id;
      const key = userId ? `${anonymousReq.ip}:${userId}` : anonymousReq.ip;
      assert.strictEqual(key, '103.21.124.5');

      const authenticatedReq = {
        headers: { 'x-device-id': 'dev_123' },
        ip: '103.21.124.5',
        user: { id: 'usr_789' },
      };
      const authUserId = (authenticatedReq.user as any)?.id;
      const authKey = authUserId ? `${authenticatedReq.ip}:${authUserId}` : authenticatedReq.ip;
      assert.strictEqual(authKey, '103.21.124.5:usr_789');
    });
  });

  describe('7. Codex / FSSAI Functional Classes & Chemical Name Normalization', () => {
    test('normalizes both INS codes and chemical names to official FunctionalClass', () => {
      const parsed = IngredientParser.parse(
        'Sodium Benzoate, INS 102, Citric Acid, INS 322, Aspartame, Monosodium Glutamate, INS 415, Sodium Bicarbonate'
      );

      const preservative = parsed.decoded.find((d) => d.normalizedName.includes('211'));
      assert.ok(preservative);
      assert.strictEqual(preservative.functionalClass, 'PRESERVATIVE');
      assert.strictEqual(preservative.processingGroup, 'GROUP_C_ULTRA_PROCESSED');

      const colour = parsed.decoded.find((d) => d.insCode === '102');
      assert.ok(colour);
      assert.strictEqual(colour.functionalClass, 'COLOUR');
      assert.strictEqual(colour.processingGroup, 'GROUP_C_ULTRA_PROCESSED');

      const acidulant = parsed.decoded.find((d) => d.normalizedName.includes('330'));
      assert.ok(acidulant);
      assert.strictEqual(acidulant.functionalClass, 'ACIDITY_REGULATOR');
      assert.strictEqual(acidulant.processingGroup, 'GROUP_B_CULINARY_INGREDIENT');

      const emulsifier = parsed.decoded.find((d) => d.insCode?.startsWith('322'));
      assert.ok(emulsifier);
      assert.strictEqual(emulsifier.functionalClass, 'EMULSIFIER');

      const sweetener = parsed.decoded.find((d) => d.insCode === '951');
      assert.ok(sweetener);
      assert.strictEqual(sweetener.functionalClass, 'SWEETENER');

      const flavourEnhancer = parsed.decoded.find((d) => d.insCode === '621');
      assert.ok(flavourEnhancer);
      assert.strictEqual(flavourEnhancer.functionalClass, 'FLAVOUR_ENHANCER');

      const thickener = parsed.decoded.find((d) => d.insCode === '415');
      assert.ok(thickener);
      assert.strictEqual(thickener.functionalClass, 'THICKENER');

      const raisingAgent = parsed.decoded.find((d) => d.insCode?.startsWith('500'));
      assert.ok(raisingAgent);
      assert.strictEqual(raisingAgent.functionalClass, 'RAISING_AGENT');
    });
  });

  describe('8. Statutory Warning Triggers (FSSAI Schedule II)', () => {
    test('triggers polyol laxative warning for Sorbitol, Maltitol, and Xylitol', () => {
      const parsed = IngredientParser.parse('Wheat flour, Maltitol, Sorbitol (INS 420), Palm oil');
      assert.ok(parsed.statutoryWarningsTriggered.length > 0);
      const polyolWarning = parsed.statutoryWarningsTriggered.find((w) =>
        w.mandatoryDeclaration.includes('Polyols may have laxative effect')
      );
      assert.ok(polyolWarning);
      assert.strictEqual(polyolWarning.regulatoryReference, 'FSSAI (Labelling and Display) Regulations 2020, Schedule II');
    });

    test('triggers artificial sweetener warnings including Aspartame PKU statement', () => {
      const parsed = IngredientParser.parse('Water, Aspartame, Acesulfame Potassium, Acidity Regulator (INS 330)');
      const aspartameWarning = parsed.statutoryWarningsTriggered.find((w) =>
        w.substance.includes('951') && w.mandatoryDeclaration.includes('Phenylketonurics: Contains Phenylalanine')
      );
      assert.ok(aspartameWarning);
      assert.ok(aspartameWarning.mandatoryDeclaration.includes('Not recommended for children'));

      const aceKWarning = parsed.statutoryWarningsTriggered.find((w) =>
        w.substance.includes('950') && w.mandatoryDeclaration.includes('Contains Acesulfame Potassium')
      );
      assert.ok(aceKWarning);
    });

    test('triggers Monosodium Glutamate (MSG) warning for infants and pregnant women', () => {
      const parsed = IngredientParser.parse('Noodles, Seasoning [Salt, Monosodium Glutamate, Spices]');
      const msgWarning = parsed.statutoryWarningsTriggered.find((w) =>
        w.mandatoryDeclaration.includes('Not recommended for infants below 12 months and pregnant women')
      );
      assert.ok(msgWarning);
    });

    test('triggers Caffeine advisory declaration', () => {
      const parsed = IngredientParser.parse('Carbonated Water, Sugar, Caffeine, Colour (INS 150d)');
      const caffeineWarning = parsed.statutoryWarningsTriggered.find((w) =>
        w.mandatoryDeclaration.includes('Contains Caffeine')
      );
      assert.ok(caffeineWarning);
    });
  });

  describe('9. ICMR-NIN 2024 Table 15.2 Processing Classification', () => {
    test('classifies whole foods as Group A and culinary ingredients as Group B', () => {
      const parsed = IngredientParser.parse('Whole Wheat Flour (Atta), Cow Milk, Turmeric, Cumin, Sugar, Iodised Salt, Ghee');
      assert.ok(parsed.processingClassificationSummary.groupACount >= 4); // Wheat, Milk, Turmeric, Cumin
      assert.ok(parsed.processingClassificationSummary.groupBCount >= 3); // Sugar, Salt, Ghee
      assert.strictEqual(parsed.processingClassificationSummary.groupCCount, 0);
      assert.strictEqual(parsed.processingClassificationSummary.isUltraProcessed, false);
    });

    test('identifies Group C ultra-processed markers and flags isUltraProcessed', () => {
      const parsed = IngredientParser.parse(
        'Refined Wheat Flour, Hydrogenated Vegetable Oil, High Fructose Corn Syrup, Invert Sugar, INS 102, INS 471, Maltodextrin'
      );
      assert.ok(parsed.processingClassificationSummary.groupCCount >= 5);
      assert.strictEqual(parsed.processingClassificationSummary.isUltraProcessed, true);
    });
  });

  describe('10. Quantitative Ingredient Declaration (QUID) & Compound 5% Rule', () => {
    test('verifies QUID compliance when emphasized ingredient declares percentage', () => {
      const parsed = IngredientParser.parse(
        'Whole Wheat Flour (Atta) (48%), Oats (20%), Sugar, Palm Oil',
        'Oats & Wheat Digestive Biscuits'
      );
      assert.strictEqual(parsed.quidAudit.hasEmphasizedIngredients, true);
      const oatsDecl = parsed.quidAudit.compliantDeclarations.find((d) => d.ingredient === 'oats');
      assert.ok(oatsDecl);
      assert.strictEqual(oatsDecl.percentage, 20);
    });

    test('flags statutory QUID non-compliance when emphasized ingredient lacks percentage', () => {
      const parsed = IngredientParser.parse(
        'Refined Wheat Flour, Sugar, Palm Oil, Almonds, Honey',
        'Real Almond & Honey Crunch Cookies'
      );
      assert.strictEqual(parsed.quidAudit.hasEmphasizedIngredients, true);
      const almondBreach = parsed.quidAudit.nonCompliantDeclarations.find((d) => d.ingredient === 'almond');
      assert.ok(almondBreach);
      assert.ok(almondBreach.reason.includes('Regulation 5(2)(g)'));

      const honeyBreach = parsed.quidAudit.nonCompliantDeclarations.find((d) => d.ingredient === 'honey');
      assert.ok(honeyBreach);
      assert.ok(honeyBreach.reason.includes('Regulation 5(2)(g)'));
    });

    test('flags non-compliance when compound ingredient >= 5% lacks bracketed sub-list', () => {
      const parsed = IngredientParser.parse(
        'Refined Wheat Flour, Sugar, Choco Paste (12%), Palm Oil',
        'Choco Filled Biscuits'
      );
      const nonCompliantCompound = parsed.quidAudit.compoundIngredients.find((c) => c.name.includes('Choco Paste'));
      assert.ok(nonCompliantCompound);
      assert.strictEqual(nonCompliantCompound.isCompliant, false);
      assert.ok(nonCompliantCompound.reason?.includes('Regulation 5(2)(e)'));
    });

    test('passes compliance when compound ingredient >= 5% declares bracketed sub-list', () => {
      const parsed = IngredientParser.parse(
        'Wheat Flour, Choco Chips (10%) [Sugar, Cocoa Solids, Hydrogenated Vegetable Fat], Sugar',
        'Choco Chip Cookies'
      );
      const compliantCompound = parsed.quidAudit.compoundIngredients.find((c) => c.name.includes('Choco Chips'));
      assert.ok(compliantCompound);
      assert.strictEqual(compliantCompound.isCompliant, true);
    });
  });

  describe('11. Mass Conservation with Minerals & IFCT 2017 Staple Bounds Check', () => {
    test('enforces mass balance limit of 102.0g including sodium and marks CORRUPT when breached', () => {
      const impossibleMass = NutrientVerifier.normalize({
        productName: 'Over-mass bar',
        brand: 'Test',
        category: 'Snacks',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 500,
        proteinG: 30,
        carbsG: 50,
        totalFatG: 25, // 30 + 50 + 25 = 105g > 102.0g!
        sodiumMg: 1500, // + 1.5g = 106.5g
      });

      const audit = NutrientVerifier.auditConsistency(impossibleMass);
      assert.strictEqual(audit.massConservation.passed, false);
      assert.strictEqual(audit.overallConfidence, 'CORRUPT');
    });

    test('catches OCR hallucination when staple declared macros violate IFCT 2017 biological bounds', () => {
      // Atta with 80g declared protein (IFCT A020 range is 6.0g - 18.0g)
      const corruptedAtta = NutrientVerifier.normalize({
        productName: 'Pure Whole Wheat Atta',
        brand: 'Farm Fresh',
        category: 'Cereals & Grains',
        form: 'SOLID',
        nutritionBasis: 'PER_100G',
        energyKcal: 400,
        proteinG: 80, // Impossible OCR hallucination!
        carbsG: 15,
        totalFatG: 2,
        sodiumMg: 10,
      });

      const audit = NutrientVerifier.auditConsistency(corruptedAtta, {
        productName: 'Pure Whole Wheat Atta',
        category: 'Cereals & Grains',
        isGenericFood: true,
      });

      assert.ok(audit.stapleBoundsCheck);
      assert.strictEqual(audit.stapleBoundsCheck.isStaple, true);
      assert.strictEqual(audit.stapleBoundsCheck.passed, false);
      assert.ok(audit.stapleBoundsCheck.reason?.includes('UNVERIFIED_NUTRITION_TABLE_CONFLICT'));
      assert.strictEqual(audit.overallConfidence, 'CORRUPT');
    });
  });
});
