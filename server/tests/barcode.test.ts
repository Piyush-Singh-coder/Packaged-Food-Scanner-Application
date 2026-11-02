import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBarcode,
  calculateGs1CheckDigit,
  verifyGs1CheckDigit,
} from '../src/common/utils/barcode.js';

describe('GS1 Barcode Verification & Normalization Engine', () => {
  describe('1. Check Digit Calculation & Verification', () => {
    test('calculates correct check digit for standard Indian EAN-13 barcodes', () => {
      // Maggi: 890105886249 + check digit '2'
      assert.strictEqual(calculateGs1CheckDigit('890105886249'), 2);
      assert.strictEqual(verifyGs1CheckDigit('8901058862492'), true);

      // Britannia Bourbon: 890106301284 + check digit '4'
      assert.strictEqual(calculateGs1CheckDigit('890106301284'), 4);
      assert.strictEqual(verifyGs1CheckDigit('8901063012844'), true);

      // Amul Taaza Milk: 890126201005 + check digit '4'
      assert.strictEqual(calculateGs1CheckDigit('890126201005'), 4);
      assert.strictEqual(verifyGs1CheckDigit('8901262010054'), true);
    });

    test('detects and rejects corrupted check digits', () => {
      // Maggi with corrupted final digit (changed 2 to 3)
      assert.strictEqual(verifyGs1CheckDigit('8901058862493'), false);

      // Britannia Bourbon with corrupted final digit (changed 4 to 0)
      assert.strictEqual(verifyGs1CheckDigit('8901063012840'), false);
    });
  });

  describe('2. Normalization Pipeline', () => {
    test('normalizes 13-digit EAN-13 barcode cleanly', () => {
      const res = normalizeBarcode('8901058862492');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.format, 'EAN-13');
      assert.strictEqual(res.normalizedGtin13, '8901058862492');
    });

    test('strips whitespace and hyphens from scanner input', () => {
      const res = normalizeBarcode(' 8901-0588-62492 ');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalizedGtin13, '8901058862492');
    });

    test('normalizes 12-digit UPC-A to 13-digit GTIN-13 with leading zero', () => {
      // Valid UPC-A: 012345678905
      const res = normalizeBarcode('012345678905');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.format, 'UPC-A');
      assert.strictEqual(res.normalizedGtin13, '0012345678905');
    });

    test('normalizes 8-digit EAN-8 to 13-digit GTIN-13', () => {
      // Valid EAN-8: 96385074
      const res = normalizeBarcode('96385074');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.format, 'EAN-8');
      assert.strictEqual(res.normalizedGtin13, '0000096385074');
    });

    test('rejects non-numeric inputs', () => {
      const res = normalizeBarcode('890105886249A');
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.error, 'Barcode contains non-numeric characters');
    });

    test('rejects barcodes with unsupported lengths', () => {
      const res = normalizeBarcode('12345'); // only 5 digits
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error?.includes('Unsupported barcode length'));
    });
  });
});
