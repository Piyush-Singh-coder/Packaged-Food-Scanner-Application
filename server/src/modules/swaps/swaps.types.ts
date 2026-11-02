import type { PersonaType } from '../engine/types.js';

export interface SwapDelta {
  metric: string;
  scannedValue: number;
  candidateValue: number;
  unit: string;
  absoluteDelta: number; // candidateValue - scannedValue (negative means reduction)
  percentDelta: number; // percentage change with zero-division safeguard
  isImprovement: boolean;
}

export interface SwapItem {
  id: string;
  barcodeGtin: string;
  productName: string;
  brandName: string;
  category: string;
  mrpInr: number;
  packageWeightG: number;
  pricePer100g: number;
  priceRatioVsScanned: number;
  energyKcal100g: number;
  addedSugar100g: number;
  saturatedFat100g: number;
  sodiumMg100g: number;
  dietaryFiber100g: number;
  proteinG100g: number;
  hfssBreachCount: number;
  keyAdvantages: string[];
  tradeOffs: string[];
  deltas: {
    addedSugar: SwapDelta;
    sodium: SwapDelta;
    saturatedFat: SwapDelta;
    dietaryFiber: SwapDelta;
    energyKcal: SwapDelta;
    price: SwapDelta;
  };
}

export interface SwapResponse {
  scannedProduct: {
    barcodeGtin: string;
    productName: string;
    brandName: string;
    category: string;
    mrpInr: number;
    packageWeightG: number | null;
    /** null means the price basis is unknown or unusable, not ₹0. */
    pricePer100g: number | null;
    /** null means the baseline could not be graded, not zero breaches. */
    hfssBreachCount: number | null;
    addedSugar100g: number | null;
    sodiumMg100g: number | null;
    saturatedFat100g: number | null;
  };
  persona: PersonaType;
  isAlreadyOptimal: boolean;
  message?: string;
  swapsCount: number;
  swaps: SwapItem[];
  noSwapsReason?: string;
}
