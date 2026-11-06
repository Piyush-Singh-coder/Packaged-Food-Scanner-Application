import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { validEan13 } from './helpers.js';

describe('Admin Review Pipeline & System Health Checks', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // Create JWT tokens directly with explicit roles
    adminToken = app.jwt.sign({
      sub: 'admin-user-id',
      userId: 'admin-user-id',
      email: 'admin@foodscanner.test',
      role: 'ADMIN',
    });

    userToken = app.jwt.sign({
      sub: 'regular-user-id',
      userId: 'regular-user-id',
      email: 'user@foodscanner.test',
      role: 'USER',
    });
  });

  after(async () => {
    await app.close();
  });

  describe('1. Health Check Probes', () => {
    test('GET /api/v1/health/live returns immediate 200 process status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/live',
      });
      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.status, 'ok');
      assert.strictEqual(json.service, 'food-scanner-api');
      assert.ok(typeof json.uptime === 'number');
    });

    test('GET /api/v1/health/ready returns 200 readiness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      });
      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.status, 'ready');
      assert.ok(json.database);
    });

    test('GET /api/v1/health provides backward-compatible endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });
      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.status, 'ok');
    });
  });

  describe('2. Admin Ingestion Review & Promotion Workflow', () => {
    const unlistedBarcode = validEan13('890999000123');
    let submissionId: string;

    test('Step 1: User stages unlisted product via OCR submit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ocr/submit',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          barcode: unlistedBarcode,
          productName: 'Crowd Sourced Multigrain Rusk',
          brandName: 'BakeWell',
          category: 'Bakery',
          form: 'SOLID',
          nutritionBasis: 'PER_100G',
          packageWeightGrams: 200,
          servingSizeGrams: 25,
          mrpInr: 45,
          energyKcal: 420,
          proteinG: 9.0,
          carbsG: 70.0,
          totalSugarG: 16.0,
          addedSugarG: 12.0,
          totalFatG: 11.0,
          saturatedFatG: 4.5,
          transFatG: 0.1,
          cholesterolMg: 0,
          sodiumMg: 280,
          saltG: 0.7,
          fiberG: 5.0,
          ingredientsText: 'Whole wheat flour, sugar, vegetable oil, yeast, salt.',
        },
      });

      assert.strictEqual(response.statusCode, 201);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'PENDING_MODERATION');
      assert.strictEqual(json.data.isAvailableForInstantScan, false);
      submissionId = json.data.submissionId;
      assert.ok(submissionId);
    });

    test('Step 2: Non-admin users are rejected from accessing moderation queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/submissions',
        headers: { authorization: `Bearer ${userToken}` },
      });
      assert.strictEqual(response.statusCode, 403);
    });

    test('Step 3: Admin lists pending submissions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/submissions?status=PENDING_REVIEW',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.ok(Array.isArray(json.data.items));
      const found = json.data.items.find((item: any) => item.id === submissionId);
      assert.ok(found);
      assert.strictEqual(found.barcodeGtin, unlistedBarcode);
    });

    test('Step 4: Admin reviews and approves submission', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/submissions/${submissionId}/review`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          decision: 'APPROVED',
          notes: 'Legible packaging photo verified against official FSSAI lab standards.',
          checklist: {
            legiblePackPhoto: true,
            valuesMatchPhoto: true,
            fssaiLicenseValid: true,
            allergensAccurate: true,
          },
        },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.decision, 'APPROVED');
    });

    test('Step 5: Admin promotes approved submission into verified catalog', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/submissions/${submissionId}/promote`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isVerified, true);
      assert.strictEqual(json.data.barcode, unlistedBarcode);
    });

    test('Step 6: Promoted product is now instantly searchable and returns a verified grade', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/products/barcode/${unlistedBarcode}`,
      });

      assert.strictEqual(response.statusCode, 200);
      const json = JSON.parse(response.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.found, true);
      assert.strictEqual(json.data.product.isVerified, true);
      assert.strictEqual(json.data.evaluation.isGraded, true);
      assert.ok(json.data.evaluation.badgeLabel);
    });
  });
});
