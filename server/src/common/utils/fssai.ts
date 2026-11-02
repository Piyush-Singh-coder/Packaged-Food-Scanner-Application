/**
 * FSSAI 14-Digit License and Registration Number Validator & Decoder
 *
 * Structure under Food Safety and Standards Authority of India:
 * - Digit 1: License type (1 = Central/State License, 2 = Basic Registration)
 * - Digits 2-3: State / Union Territory Code (e.g. 00 = Central, 01-37 = States/UTs)
 * - Digits 4-5: Year of enrollment (e.g. 19, 20, 22, 24)
 * - Digits 6-8: Jurisdiction / District / Enrolling Officer code
 * - Digits 9-14: Sequential license serial number
 */

export interface FssaiLicenseDetails {
  isValid: boolean;
  rawNumber: string;
  licenseType?: 'CENTRAL_OR_STATE_LICENSE' | 'BASIC_REGISTRATION';
  stateCode?: string;
  stateName?: string;
  yearOfEnrollment?: number;
  serialNumber?: string;
  verificationUrl?: string;
  error?: string;
}

const INDIAN_STATE_CODES: Record<string, string> = {
  '00': 'Central License (FSSAI HQ)',
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Ladakh',
};

export function validateFssaiLicense(raw: string): FssaiLicenseDetails {
  const cleaned = raw.replace(/\D/g, '').trim();

  if (cleaned.length !== 14) {
    return {
      isValid: false,
      rawNumber: cleaned,
      error: `FSSAI license must be exactly 14 digits (received ${cleaned.length} digits).`,
    };
  }

  const firstDigit = cleaned[0];
  if (firstDigit !== '1' && firstDigit !== '2') {
    return {
      isValid: false,
      rawNumber: cleaned,
      error: 'First digit must be 1 (License) or 2 (Registration).',
    };
  }

  // Format matches strict /^[12]\d{13}$/
  // Best-effort informational decoding (never fails validation on legacy/renewed licenses)
  const stateCode = cleaned.substring(1, 3);
  const stateName = INDIAN_STATE_CODES[stateCode];

  const yearDigits = parseInt(cleaned.substring(3, 5), 10);
  const yearOfEnrollment = !isNaN(yearDigits) && yearDigits >= 11 && yearDigits <= 50
    ? 2000 + yearDigits
    : undefined;

  const serialNumber = cleaned.substring(8, 14);

  return {
    isValid: true,
    rawNumber: cleaned,
    licenseType: firstDigit === '1' ? 'CENTRAL_OR_STATE_LICENSE' : 'BASIC_REGISTRATION',
    stateCode,
    stateName,
    yearOfEnrollment,
    serialNumber,
    verificationUrl: `https://foscos.fssai.gov.in/consumergrievance/`,
  };
}

/**
 * Searches a block of text (e.g. from an OCR package scan) for FSSAI license numbers.
 */
export function extractFssaiLicensesFromText(text: string): FssaiLicenseDetails[] {
  if (!text) return [];

  // Match patterns like "FSSAI Lic. No. 10012022000288", "Lic No: 10014011001234", or standalone 14 digits starting with 1 or 2
  const regex = /(?:fssai|lic(?:ense|ence)?(?:\s*no\.?)?)?\s*([12]\d{13})\b/gi;
  const matches = new Set<string>();

  for (const match of text.matchAll(regex)) {
    const candidate = match[1];
    if (candidate && candidate.length === 14) {
      matches.add(candidate);
    }
  }

  return Array.from(matches).map(validateFssaiLicense);
}
