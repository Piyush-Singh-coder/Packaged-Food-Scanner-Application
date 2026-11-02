import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { OcrParser } from '../src/modules/ocr/ocr.parser.js';

describe('Packaging OCR Ingestion & Plausibility Gating Engine API', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  describe('1. Packaging OCR Extraction & Plausibility Audit (POST /api/v1/ocr/parse)', () => {
    test('does not invent package or serving sizes when OCR does not contain them', () => {
      const parsed = OcrParser.parse('NUTRITIONAL INFORMATION\nEnergy 400 kcal\nProtein 5 g');

      assert.equal(parsed.packageWeightGrams, undefined);
      assert.equal(parsed.servingSizeGrams, undefined);
    });

    test('does not guess a basis when the OCR only contains a nutrition heading', () => {
      const parsed = OcrParser.parse('NUTRITIONAL INFORMATION\nEnergy 400 kcal\nProtein 5 g\nTotal Fat 10 g');

      assert.equal(parsed.declaredBasis, 'UNKNOWN');
      assert.equal(parsed.per100g.energyKcal, undefined);
      assert.equal(parsed.per100g.proteinG, undefined);
      assert.equal(parsed.per100g.totalFatG, undefined);
    });

    test('converts a declared per-serving table only when the serving size is present', () => {
      const parsed = OcrParser.parse(`
        NUTRITION INFORMATION
        Per serving (30 g)
        Energy 150 kcal
        Protein 2 g
        Carbohydrate 20 g
        Total Sugars 8 g
        Added Sugars 7 g
        Total Fat 6 g
        Saturated Fat 3 g
        Trans Fat 0.1 g
        Cholesterol 5 mg
        Sodium 100 mg
        Ingredients: Wheat flour, Sugar, Palm oil.
      `);

      assert.equal(parsed.declaredBasis, 'PER_SERVING');
      assert.equal(parsed.servingSizeGrams, 30);
      assert.equal(parsed.nutritionBasis, 'PER_100G');
      assert.equal(parsed.perServing?.energyKcal, 150);
      assert.equal(parsed.per100g.energyKcal, 500);
      assert.equal(parsed.per100g.addedSugarG, 23.33);
      assert.equal(parsed.per100g.sodiumMg, 333.3);
    });

    test('converts a per-serving liquid to per-100ml only when the pack is declared by volume', () => {
      const beverage = OcrParser.parse(`
        Mango Drink
        Nutrition Information
        Per serving (250 ml)
        Energy 120 kcal
        Protein 0 g
        Carbohydrate 30 g
        Total Sugars 28 g
        Added Sugars 25 g
        Total Fat 0 g
        Saturated Fat 0 g
        Trans Fat 0 g
        Cholesterol 0 mg
        Sodium 40 mg
        Net Qty: 1 L
        Serving size: 250 ml
        Ingredients: Water, Sugar, Mango pulp.
      `);

      assert.equal(beverage.declaredBasis, 'PER_SERVING');
      assert.equal(beverage.nutritionBasis, 'PER_100ML');
      assert.equal(beverage.per100g.energyKcal, 48);
    });

    test('keeps a gram-based per-serving sauce on a per-100g basis', () => {
      const sauce = OcrParser.parse(`
        Tomato Ketchup
        Nutrition Information
        Per serving (15 g)
        Energy 15 kcal
        Protein 0 g
        Carbohydrate 3 g
        Total Sugars 2 g
        Added Sugars 1 g
        Total Fat 0 g
        Saturated Fat 0 g
        Trans Fat 0 g
        Cholesterol 0 mg
        Sodium 120 mg
        Net Qty: 500 g
        Serving size: 15 g
        Ingredients: Tomato, Sugar, Salt.
      `);

      assert.equal(sauce.form, 'LIQUID');
      assert.equal(sauce.category, 'Sauces & Condiments');
      assert.equal(sauce.declaredBasis, 'PER_SERVING');
      assert.equal(sauce.nutritionBasis, 'PER_100G');
      assert.equal(sauce.per100g.energyKcal, 100);
      assert.equal(sauce.per100g.sodiumMg, 800);
    });

    test('does not let ingredient text change the front-of-pack form classification', () => {
      const parsed = OcrParser.parse(`
        Mango Juice
        Nutrition Information per 100 ml
        Energy 50 kcal
        Protein 0 g
        Carbohydrate 12 g
        Total Sugars 11 g
        Added Sugars 10 g
        Total Fat 0 g
        Saturated Fat 0 g
        Trans Fat 0 g
        Cholesterol 0 mg
        Sodium 20 mg
        Ingredients: Water, Sugar, Wheat flour.
      `);

      assert.equal(parsed.category, 'Beverages & Soft Drinks');
      assert.equal(parsed.form, 'LIQUID');
      assert.equal(parsed.nutritionBasis, 'PER_100ML');
    });

    test('reads both columns of a per-100g and per-serving table', () => {
      const parsed = OcrParser.parse(`
        Nutrition Information per 100g per serving
        Energy 500 kcal 100 kcal
        Protein 6 g 1.2 g
        Carbohydrate 70 g 14 g
        Total Sugars 20 g 4 g
        Added Sugars 18 g 3.6 g
        Total Fat 15 g 3 g
        Saturated Fat 5 g 1 g
        Trans Fat 0.1 g 0.02 g
        Cholesterol 0 mg 0 mg
        Sodium 240 mg 48 mg
        Serving size: 20 g
        Ingredients: Wheat flour, Sugar, Palm oil.
      `);

      assert.equal(parsed.declaredBasis, 'PER_100G');
      assert.equal(parsed.nutritionBasis, 'PER_100G');
      assert.equal(parsed.per100g.energyKcal, 500);
      assert.equal(parsed.perServing?.energyKcal, 100);
      assert.equal(parsed.per100g.saturatedFatG, 5);
      assert.equal(parsed.perServing?.saturatedFatG, 1);
    });

    test('refuses to guess whether a lone value under a two-column header is per 100g or per serving', () => {
      const parsed = OcrParser.parse(`
        Nutrition Information per 100g per serving
        Energy 500 kcal
        Protein 6 g
        Serving size: 20 g
        Ingredients: Wheat flour, Sugar, Palm oil.
      `);

      assert.equal(parsed.declaredBasis, 'PER_100G');
      assert.equal(parsed.per100g.energyKcal, undefined);
      assert.equal(parsed.per100g.proteinG, undefined);
      assert.equal(parsed.perServing?.energyKcal, undefined);
    });

    test('converts kJ to kcal instead of treating kJ as kcal', () => {
      const parsed = OcrParser.parse(`
        Nutrition Information per 100g
        Energy 2092 kJ
        Protein 5 g
        Ingredients: Wheat flour.
      `);

      assert.equal(parsed.nutritionBasis, 'PER_100G');
      assert.equal(parsed.per100g.energyKcal, 500);
    });

    test('preserves a per-100ml basis for a liquid label', () => {
      const parsed = OcrParser.parse(`
        Beverage
        Nutrition Information per 100 ml
        Energy 50 kcal
        Protein 0 g
        Carbohydrate 12 g
        Total Sugars 11 g
        Added Sugars 10 g
        Total Fat 0 g
        Saturated Fat 0 g
        Trans Fat 0 g
        Cholesterol 0 mg
        Sodium 40 mg
        Ingredients: Water, Sugar.
      `);

      assert.equal(parsed.declaredBasis, 'PER_100ML');
      assert.equal(parsed.nutritionBasis, 'PER_100ML');
      assert.equal(parsed.form, 'LIQUID');
      assert.equal(parsed.per100g.energyKcal, 50);
    });

    test('extracts a gram serving size from a count-based serving phrase', () => {
      const parsed = OcrParser.parse(`
        Nutrition Information per 100g
        Energy 400 kcal
        Serving size: 1 biscuit (10 g)
        Net Qty: 100 g
      `);

      assert.equal(parsed.servingSizeGrams, 10);
    });

    test('separates statutory allergen statements from may-contain advisories', () => {
      const parsed = OcrParser.parse(`
        Nutrition Information per 100g
        Energy 400 kcal
        Ingredients: Wheat flour, Sugar, Palm oil, Milk solids.
        Contains: Wheat, Milk.
        May contain: Soy, Tree nuts.
      `);

      assert.equal(parsed.ingredientsText.includes('Contains'), false);
      assert.equal(parsed.allergenStatement, 'Wheat, Milk.');
      assert.equal(parsed.mayContainStatement, 'Soy, Tree nuts.');
    });

    test('extracts packaging metadata and passes plausibility audit with HIGH confidence', async () => {
      const sampleOcrText = `
        BRITANNIA
        GOOD DAY BUTTER COOKIES
        NUTRITIONAL INFORMATION
        Typical values per 100g:
        Energy 505 kcal
        Protein 7.0 g
        Carbohydrate 67.0 g
        Total Sugars 23.5 g
        Added Sugars 21.0 g
        Total Fat 23.0 g
        Saturated Fat 11.0 g
        Trans Fat 0.1 g
        Cholesterol 0 mg
        Sodium 280 mg
        Dietary Fiber 2.0 g
        Net Qty: 100 g
        Serving Size: 20 g
        MRP Rs. 35.00
        INGREDIENTS: Refined Wheat Flour (Maida), Sugar, Refined Palm Oil, Butter (2%), Invert Sugar Syrup, Raising Agents [INS 503(ii), INS 500(ii)], Milk Solids, Iodised Salt.
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/parse',
        payload: {
          rawText: sampleOcrText,
          barcode: '8901063012844',
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);

      const data = json.data.extractedData;
      assert.strictEqual(data.packageWeightGrams, 100);
      assert.strictEqual(data.servingSizeGrams, 20);
      assert.strictEqual(data.form, 'SOLID');
      assert.strictEqual(data.nutritionBasis, 'PER_100G');
      assert.strictEqual(data.mrpInr, 35.0);

      assert.strictEqual(data.per100g.energyKcal, 505);
      assert.strictEqual(data.per100g.proteinG, 7.0);
      assert.strictEqual(data.per100g.carbsG, 67.0);
      assert.strictEqual(data.per100g.totalSugarG, 23.5);
      assert.strictEqual(data.per100g.addedSugarG, 21.0);
      assert.strictEqual(data.per100g.totalFatG, 23.0);
      assert.strictEqual(data.per100g.saturatedFatG, 11.0);
      assert.strictEqual(data.per100g.transFatG, 0.1);
      assert.strictEqual(data.per100g.cholesterolMg, 0);
      assert.strictEqual(data.per100g.sodiumMg, 280);

      const audit = json.data.plausibilityAudit;
      assert.strictEqual(audit.isPlausible, true);
      assert.strictEqual(audit.overallConfidence, 'HIGH');
      assert.strictEqual(audit.atwaterEnergy.passed, true);
      assert.strictEqual(audit.massConservation.passed, true);
      assert.strictEqual(json.data.requiresUserConfirmation, false);
    });

    test('detects OCR misread and flags mass conservation violation as CORRUPT', async () => {
      const corruptOcrText = `
        Sample Crisp Snack
        NUTRITION FACTS Per 100g:
        Energy 480 kcal
        Protein 80.0 g
        Carbohydrate 60.0 g
        Total Sugars 5.0 g
        Total Fat 25.0 g
        Sodium 400 mg
        Net Weight: 100g
        INGREDIENTS: Potatoes, Edible Oil, Salt.
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/parse',
        payload: {
          rawText: corruptOcrText,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.data.plausibilityAudit.overallConfidence, 'CORRUPT');
      assert.strictEqual(json.data.plausibilityAudit.massConservation.passed, false);
      assert.strictEqual(json.data.requiresUserConfirmation, true);
      assert.ok(json.data.safetyMessage.includes('Critical discrepancy'));
    });

    test('flags hierarchical inconsistency when total sugar exceeds total carbs', async () => {
      const inconsistentText = `
        Fruit Candy
        Nutritional Information per 100g:
        Energy 300 kcal
        Carbohydrate 20.0 g
        Total Sugars 35.0 g
        Protein 0 g
        Total Fat 0 g
        Sodium 10 mg
        Net Qty: 50 g
        Ingredients: Sugar, Liquid Glucose, Flavours.
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/parse',
        payload: {
          rawText: inconsistentText,
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.data.requiresUserConfirmation, true);

      const carbsCheck = json.data.confirmationChecklist.find((c: any) => c.fieldName === 'carbsG');
      assert.ok(carbsCheck);
      assert.strictEqual(carbsCheck.confidence, 'SUSPECT');
      assert.ok(carbsCheck.warningNote.includes('exceed total carbohydrates'));
    });

    test('does not treat a short non-nutrition OCR fragment as a trustworthy label', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/parse',
        payload: { rawText: 'BRAND PACKAGING TEXT WITH NO NUTRITION TABLE' },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.data.plausibilityAudit.overallConfidence, 'SUSPECT');
      assert.strictEqual(json.data.requiresUserConfirmation, true);
      assert.ok(json.data.confirmationChecklist.some((field: any) => field.fieldName === 'nutritionCompleteness'));
    });
  });

  describe('2. Direct Real-Time Scientific Evaluation (POST /api/v1/ocr/evaluate)', () => {
    test('shows threshold diagnostics but withholds the grade until evidence is verified', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/evaluate',
        payload: {
          productName: 'Cream Biscuit Delight',
          brandName: 'Test Brand',
          category: 'Biscuits & Cookies',
          form: 'SOLID',
          nutritionBasis: 'PER_100G',
          packageWeightGrams: 100,
          servingSizeGrams: 25,
          energyKcal: 490,
          proteinG: 6.0,
          carbsG: 70.0,
          totalSugarG: 34.0,
          addedSugarG: 32.0,
          totalFatG: 21.0,
          saturatedFatG: 9.5,
          transFatG: 0.05,
          cholesterolMg: 0,
          sodiumMg: 240,
          saltG: 0.6,
          fiberG: 1.5,
          ingredientsText: 'Refined Wheat Flour, Sugar, Palm Oil, Cocoa Solids, INS 500(ii), INS 322(i).',
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);

      const evaluation = json.data.evaluation;
      assert.equal(evaluation.sourceIntegrity.completeForEvaluation, false);
      assert.equal(evaluation.sourceIntegrity.status, 'UNSUPPORTED');
      assert.equal(evaluation.evaluability.status, 'SOURCE_UNVERIFIED');
      assert.equal(evaluation.isGraded, false);
      assert.equal(evaluation.frequencyGrade, 'NOT_EVALUABLE');
      assert.equal(evaluation.evaluability.canShowGrade, false);

      const breachedNutrients = evaluation.table151HfssChecks
        .filter((c: any) => c.isBreached)
        .map((c: any) => c.nutrient);

      assert.ok(breachedNutrients.includes('Energy'));
      assert.ok(breachedNutrients.includes('Added Sugar'));
      assert.ok(breachedNutrients.includes('Saturated Fat'));

      assert.strictEqual(evaluation.visualizers.sugarTeaspoonsPerServing, 2.0);
      assert.strictEqual(evaluation.visualizers.sugarTeaspoonsWholePack, 8.0);

      const diabeticVerdict = evaluation.familyVerdicts.find((v: any) => v.personaId === 'DIABETIC');
      assert.ok(diabeticVerdict);
      assert.strictEqual(diabeticVerdict.status, 'INSUFFICIENT_DATA');
    });
  });

  describe('3. Community Ingestion & Anti-Poisoning Gate (POST /api/v1/ocr/submit)', () => {
    const testNewBarcode = '8901000000019';

    test('rejects submissions with corrupted check digits with 422', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/submit',
        payload: {
          barcode: '8901000000018',
          productName: 'Sample Product',
          brandName: 'Test Brand',
          category: 'Snacks',
          form: 'SOLID',
          nutritionBasis: 'PER_100G',
          packageWeightGrams: 50,
          servingSizeGrams: 50,
          energyKcal: 250,
          proteinG: 4,
          carbsG: 30,
          totalSugarG: 5,
          totalFatG: 12,
          saturatedFatG: 4,
          ingredientsText: 'Wheat, Oil, Salt',
        },
      });

      assert.strictEqual(response.statusCode, 422);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'VALIDATION_ERROR');
    });

    test('rejects physically impossible submissions that violate mass conservation with 422', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/submit',
        payload: {
          barcode: testNewBarcode,
          productName: 'Impossible Snack',
          brandName: 'Fraud Brand',
          category: 'Snacks',
          form: 'SOLID',
          nutritionBasis: 'PER_100G',
          packageWeightGrams: 100,
          servingSizeGrams: 100,
          energyKcal: 400,
          proteinG: 60,
          carbsG: 70,
          totalSugarG: 10,
          totalFatG: 20,
          saturatedFatG: 5,
          sodiumMg: 0,
          ingredientsText: 'Flour, Sugar, Oil',
        },
      });

      assert.strictEqual(response.statusCode, 422);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.code, 'UNPROCESSABLE_ENTITY');
      assert.ok(json.message.includes('Contribution rejected'));
    });

    test('accepts plausible community product for moderation without publishing it to catalog', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/submit',
        payload: {
          barcode: testNewBarcode,
          productName: 'Roasted Jowar Crisps',
          brandName: 'Healthy Bharat',
          category: 'Healthy Snacks',
          form: 'SOLID',
          nutritionBasis: 'PER_100G',
          packageWeightGrams: 60,
          servingSizeGrams: 30,
          mrpInr: 40.0,
          energyKcal: 390,
          proteinG: 8.5,
          carbsG: 68.0,
          totalSugarG: 1.0,
          addedSugarG: 0.0,
          totalFatG: 9.0,
          saturatedFatG: 2.0,
          transFatG: 0.0,
          cholesterolMg: 0,
          sodiumMg: 310,
          saltG: 0.78,
          fiberG: 7.0,
          ingredientsText: 'Sorghum (Jowar) (80%), Rice Bran Oil, Himalayan Rock Salt, Mixed Spices.',
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'PENDING_MODERATION');
      assert.strictEqual(json.data.isAvailableForInstantScan, false);
      assert.strictEqual(json.data.dataProvenance, 'USER_CONTRIBUTED_PENDING');

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/products/barcode/${testNewBarcode}`,
      });

      assert.strictEqual(getResponse.statusCode, 404);
    });
  });
});
