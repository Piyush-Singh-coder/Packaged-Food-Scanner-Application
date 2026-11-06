/**
 * Shared test helpers for Food-Scanner test suites.
 */

export function validEan13(prefix12: string): string {
  const digits = prefix12.padEnd(12, '0').slice(0, 12).split('').map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return `${prefix12}${String((10 - (sum % 10)) % 10)}`;
}
