/**
 * Barcode & GTIN Normalization and Check-Digit Verification
 * Compliant with GS1 General Specifications (GTIN-8, GTIN-12, GTIN-13, GTIN-14)
 */

export interface BarcodeValidationResult {
  isValid: boolean;
  normalizedGtin13?: string;
  originalInput: string;
  format?: 'EAN-13' | 'UPC-A' | 'EAN-8' | 'GTIN-14';
  error?: string;
}

/**
 * Calculates the standard GS1 Modulo-10 check digit for a numeric string.
 * Weights alternate: 3 for digits from the right, 1 for the next, etc.
 */
export function calculateGs1CheckDigit(digitsWithoutCheckDigit: string): number {
  if (!/^\d+$/.test(digitsWithoutCheckDigit)) {
    throw new RangeError('GS1 check-digit input must contain only digits');
  }

  let sum = 0;
  const len = digitsWithoutCheckDigit.length;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(digitsWithoutCheckDigit[len - 1 - i], 10);
    // Alternate multipliers 3, 1, 3, 1... starting from the rightmost digit
    const weight = i % 2 === 0 ? 3 : 1;
    sum += digit * weight;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates whether a barcode's check digit matches the GS1 algorithm.
 */
export function verifyGs1CheckDigit(barcode: string): boolean {
  if (!/^\d+$/.test(barcode) || barcode.length < 8 || barcode.length > 14) {
    return false;
  }

  const digitsWithoutCheckDigit = barcode.slice(0, -1);
  const declaredCheckDigit = parseInt(barcode.slice(-1), 10);
  const calculated = calculateGs1CheckDigit(digitsWithoutCheckDigit);

  return declaredCheckDigit === calculated;
}

/**
 * Cleans and normalizes a barcode string into standard 13-digit EAN-13 (GTIN-13).
 *
 * Edge Cases Handled:
 * 1. Whitespace and non-numeric punctuation removed.
 * 2. UPC-A (12 digits) is zero-padded on the left to standard 13-digit GTIN-13.
 * 3. EAN-13 (13 digits) verified and preserved.
 * 4. EAN-8 (8 digits) validated via check digit.
 * 5. Corrupted scans with invalid check digits are strictly rejected.
 * 6. Non-numeric or invalid length inputs return descriptive errors.
 */
export function normalizeBarcode(rawInput: string): BarcodeValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      isValid: false,
      originalInput: String(rawInput ?? ''),
      error: 'Barcode must be a non-empty string',
    };
  }

  // 1. Strip leading/trailing whitespaces, dashes, and invisible control characters
  const cleaned = rawInput.trim().replace(/[-\s]/g, '');

  // 2. Reject non-numeric inputs
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      originalInput: rawInput,
      error: 'Barcode contains non-numeric characters',
    };
  }

  const len = cleaned.length;

  // 3. Handle by length and verify check digit
  if (len === 8) {
    // EAN-8
    if (!verifyGs1CheckDigit(cleaned)) {
      return {
        isValid: false,
        originalInput: rawInput,
        format: 'EAN-8',
        error: 'Invalid EAN-8 check digit (corrupted scan)',
      };
    }
    // Zero-pad EAN-8 to standard 13-digit GTIN-13
    const normalized = cleaned.padStart(13, '0');
    return {
      isValid: true,
      originalInput: rawInput,
      normalizedGtin13: normalized,
      format: 'EAN-8',
    };
  }

  if (len === 12) {
    // UPC-A (North American standard) -> convert to 13-digit EAN-13 with leading 0
    if (!verifyGs1CheckDigit(cleaned)) {
      return {
        isValid: false,
        originalInput: rawInput,
        format: 'UPC-A',
        error: 'Invalid UPC-A check digit (corrupted scan)',
      };
    }
    const normalized = '0' + cleaned;
    return {
      isValid: true,
      originalInput: rawInput,
      normalizedGtin13: normalized,
      format: 'UPC-A',
    };
  }

  if (len === 13) {
    // Standard EAN-13 / GTIN-13 (Standard across India)
    if (!verifyGs1CheckDigit(cleaned)) {
      return {
        isValid: false,
        originalInput: rawInput,
        format: 'EAN-13',
        error: 'Invalid EAN-13 check digit (corrupted scan)',
      };
    }
    return {
      isValid: true,
      originalInput: rawInput,
      normalizedGtin13: cleaned,
      format: 'EAN-13',
    };
  }

  if (len === 14) {
    // Shipping Container / GTIN-14
    if (!verifyGs1CheckDigit(cleaned)) {
      return {
        isValid: false,
        originalInput: rawInput,
        format: 'GTIN-14',
        error: 'Invalid GTIN-14 check digit',
      };
    }
    // If it has leading zero, trim to 13 digits
    const normalized = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
    return {
      isValid: true,
      originalInput: rawInput,
      normalizedGtin13: normalized,
      format: 'GTIN-14',
    };
  }

  return {
    isValid: false,
    originalInput: rawInput,
    error: `Unsupported barcode length: ${len} digits. Expected 8, 12, 13, or 14 digits.`,
  };
}
