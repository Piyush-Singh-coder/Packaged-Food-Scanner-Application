import type { NutritionDeclarationBasis, NutritionEvidenceMap, NutritionField, RawNutritionInput } from '../engine/types.js';

interface CacheEntry {
  status: 'FOUND' | 'NOT_FOUND';
  data: RawNutritionInput | null;
  cachedAt: number;
}

export type OffFetchResult =
  | { status: 'FOUND'; product: RawNutritionInput }
  | { status: 'NOT_FOUND' }
  | { status: 'UPSTREAM_UNAVAILABLE'; statusCode?: number; error?: string };

/**
 * Open Food Facts API v2 Client
 *
 * Provides external barcode fallback for millions of global and Indian products.
 * Includes:
 * - Leaky bucket rate limiter (max 12 req/min to respect OFF's 15 req/min per-IP ceiling)
 * - Negative caching for 404/not-found barcodes (2 hours)
 * - Positive caching for found products (24 hours)
 * - Distinction between 404 (not found) and 503/timeout/network errors (upstream unavailable)
 * - Strict data cleansing: strips corrupt estimates (e.g. added sugar > total sugar)
 */
export class OpenFoodFactsClient {
  private static cache = new Map<string, CacheEntry>();
  private static POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static NEGATIVE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;  // 2 hours
  private static TIMEOUT_MS = 3000; // 3 seconds timeout

  // Rate Limiting: Leaky Bucket (Max 12 requests / 60s -> min 5000ms between refills)
  private static MAX_TOKENS = 12;
  private static tokens = 12;
  private static lastRefill = Date.now();
  private static REFILL_INTERVAL_MS = 5000; // 1 token every 5 seconds (12 per min)
  private static requestQueue: Array<() => void> = [];
  private static isProcessingQueue = false;

  /**
   * Refills the token bucket based on elapsed time.
   */
  private static refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.REFILL_INTERVAL_MS);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.MAX_TOKENS, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Waits for an available token before dispatching an HTTP request to Open Food Facts.
   */
  private static async acquireToken(): Promise<void> {
    this.refillTokens();
    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }

    // Queue request and wait for next token
    return new Promise<void>((resolve) => {
      this.requestQueue.push(resolve);
      this.scheduleQueueProcessor();
    });
  }

  private static scheduleQueueProcessor(): void {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const interval = setInterval(() => {
      this.refillTokens();
      while (this.tokens > 0 && this.requestQueue.length > 0) {
        this.tokens -= 1;
        const next = this.requestQueue.shift();
        if (next) next();
      }

      if (this.requestQueue.length === 0) {
        clearInterval(interval);
        this.isProcessingQueue = false;
      }
    }, 1000);
  }

  /**
   * Fetches product from Open Food Facts with rate limiting, negative caching,
   * and clean error classification.
   */
  public static async fetchProduct(barcode: string): Promise<OffFetchResult> {
    const cached = this.cache.get(barcode);
    const now = Date.now();

    if (cached) {
      const ttl = cached.status === 'FOUND' ? this.POSITIVE_CACHE_TTL_MS : this.NEGATIVE_CACHE_TTL_MS;
      if (now - cached.cachedAt < ttl) {
        if (cached.status === 'FOUND' && cached.data) {
          return { status: 'FOUND', product: cached.data };
        }
        return { status: 'NOT_FOUND' };
      }
      this.cache.delete(barcode);
    }

    try {
      await this.acquireToken();

      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
        barcode
      )}.json?fields=code,product_name,brands,categories,quantity,serving_size,ingredients_text,nutriments,allergens_tags`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FoodScanner-India-Engine/1.0 (https://github.com/food-scanner)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.TIMEOUT_MS),
      });

      if (response.status === 404) {
        this.cache.set(barcode, { status: 'NOT_FOUND', data: null, cachedAt: now });
        return { status: 'NOT_FOUND' };
      }

      if (!response.ok) {
        // 503, 500, 429, etc. are upstream failures; do NOT cache as negative 404
        return {
          status: 'UPSTREAM_UNAVAILABLE',
          statusCode: response.status,
          error: `Open Food Facts responded with HTTP ${response.status}`,
        };
      }

      const json = (await response.json()) as any;
      if (!json || json.status === 0 || !json.product) {
        this.cache.set(barcode, { status: 'NOT_FOUND', data: null, cachedAt: now });
        return { status: 'NOT_FOUND' };
      }

      const mapped = this.mapAndCleanseOpenFoodFactsProduct(json.product);
      if (!mapped) {
        // Product in OFF lacked core macronutrients or was mathematically unparseable
        this.cache.set(barcode, { status: 'NOT_FOUND', data: null, cachedAt: now });
        return { status: 'NOT_FOUND' };
      }

      this.cache.set(barcode, { status: 'FOUND', data: mapped, cachedAt: now });
      return { status: 'FOUND', product: mapped };
    } catch (err: any) {
      // Network timeout, DNS failure, or aborted signal
      return {
        status: 'UPSTREAM_UNAVAILABLE',
        error: err?.message || 'Network failure or timeout contacting Open Food Facts',
      };
    }
  }

  /**
   * Backwards-compatible helper returning RawNutritionInput or null.
   */
  public static async fetchProductByBarcode(barcode: string): Promise<RawNutritionInput | null> {
    const result = await this.fetchProduct(barcode);
    if (result.status === 'FOUND') {
      return result.product;
    }
    return null;
  }

  public static clearCache(): void {
    this.cache.clear();
    this.tokens = this.MAX_TOKENS;
    this.lastRefill = Date.now();
    this.requestQueue = [];
  }

  /**
   * Maps OFF JSON into RawNutritionInput while sanitizing unverified estimates.
   * Discards corrupt values (e.g. added sugar > total sugar, saturated fat > total fat).
   */
  public static mapAndCleanseOpenFoodFactsProduct(p: any): RawNutritionInput | null {
    const nutriments = p.nutriments || {};

    const productName = (p.product_name || 'Unbranded Product').trim();
    const brand = (p.brands || 'Unknown Brand').trim();
    const category = (p.categories || 'Packaged Foods').split(',')[0].trim();

    // Determine basis
    const quantityStr = String(p.quantity || '').toLowerCase();
    const isLiquid =
      quantityStr.includes('ml') ||
      quantityStr.includes('l') ||
      /\b(?:drink|beverage|juice|cola|soda|milk)\b/i.test(category);
    const nutritionBasis: NutritionDeclarationBasis = isLiquid ? 'PER_100ML' : 'PER_100G';

    // Parse serving size
    let servingSizeGrams: number | undefined;
    if (p.serving_size) {
      const match = String(p.serving_size).match(/(\d+(?:\.\d+)?)\s*(?:g|ml)?/i);
      if (match) {
        servingSizeGrams = parseFloat(match[1]);
      }
    }

    const energyKcal = this.numberOrUndef(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal']);
    let proteinG = this.numberOrUndef(nutriments['proteins_100g']);
    let carbsG = this.numberOrUndef(nutriments['carbohydrates_100g']);
    let totalSugarG = this.numberOrUndef(nutriments['sugars_100g']);
    let addedSugarG = this.numberOrUndef(nutriments['added-sugars_100g']);
    let totalFatG = this.numberOrUndef(nutriments['fat_100g']);
    let saturatedFatG = this.numberOrUndef(nutriments['saturated-fat_100g']);
    let transFatG = this.numberOrUndef(nutriments['trans-fat_100g']);

    // Cholesterol safe unit conversion (OFF standardizes _100g to grams)
    const rawChol = this.numberOrUndef(nutriments['cholesterol_100g'] ?? nutriments['cholesterol_value']);
    const cholUnit = typeof nutriments['cholesterol_unit'] === 'string'
      ? nutriments['cholesterol_unit'].trim().toLowerCase()
      : undefined;
    let cholesterolMg: number | undefined;

    if (rawChol !== undefined) {
      if (rawChol === 0) {
        cholesterolMg = 0;
      } else if (cholUnit === 'mg') {
        cholesterolMg = Number(rawChol.toFixed(1));
      } else if (cholUnit === 'g') {
        cholesterolMg = Number((rawChol * 1000).toFixed(1));
      } else if (cholUnit === 'mcg' || cholUnit === 'µg') {
        cholesterolMg = Number((rawChol / 1000).toFixed(1));
      } else {
        // Missing unit fallback: OFF database standardizes to grams.
        // Packaged food rarely exceeds 2g (2000mg) cholesterol/100g.
        cholesterolMg = rawChol > 0 && rawChol <= 2.0
          ? Number((rawChol * 1000).toFixed(1))
          : Number(rawChol.toFixed(1));
      }
      // Sanitize physically impossible values (> 5000mg / 100g)
      if (cholesterolMg !== undefined && cholesterolMg > 5000) {
        cholesterolMg = undefined;
      }
    }

    const saltG = this.numberOrUndef(nutriments['salt_100g'] ?? nutriments['salt_value']);
    const rawSodium = this.numberOrUndef(nutriments['sodium_100g'] ?? nutriments['sodium_value']);
    const sodiumUnit = typeof nutriments['sodium_unit'] === 'string'
      ? nutriments['sodium_unit'].trim().toLowerCase()
      : undefined;
    let sodiumMg: number | undefined;

    if (rawSodium !== undefined) {
      if (rawSodium === 0) {
        sodiumMg = 0;
      } else if (saltG !== undefined && saltG > 0) {
        const expectedFromSalt = saltG * 400.0;
        const isMgConsistent = Math.abs(expectedFromSalt - rawSodium) / rawSodium < 0.20;
        const isGramConsistent = Math.abs(expectedFromSalt - rawSodium * 1000) / (rawSodium * 1000) < 0.20;

        if (isGramConsistent && !isMgConsistent) {
          sodiumMg = Number((rawSodium * 1000).toFixed(1));
        } else if (isMgConsistent && !isGramConsistent) {
          sodiumMg = Number(rawSodium.toFixed(1));
        } else {
          // Stoichiometric check inconclusive or conflicting; fall back to unit string or magnitude
          if (sodiumUnit === 'g') {
            sodiumMg = Number((rawSodium * 1000).toFixed(1));
          } else if (sodiumUnit === 'mg') {
            sodiumMg = Number(rawSodium.toFixed(1));
          } else if (sodiumUnit === 'mcg' || sodiumUnit === 'µg') {
            sodiumMg = Number((rawSodium / 1000).toFixed(1));
          } else {
            // Values < 1 in packaged food are universally grams (e.g. 0.25g = 250mg)
            sodiumMg = rawSodium < 1.0
              ? Number((rawSodium * 1000).toFixed(1))
              : Number(rawSodium.toFixed(1));
          }
        }
      } else {
        // Salt is missing or 0: rely on sodium_unit
        if (sodiumUnit === 'g') {
          sodiumMg = Number((rawSodium * 1000).toFixed(1));
        } else if (sodiumUnit === 'mg') {
          sodiumMg = Number(rawSodium.toFixed(1));
        } else if (sodiumUnit === 'mcg' || sodiumUnit === 'µg') {
          sodiumMg = Number((rawSodium / 1000).toFixed(1));
        } else {
          sodiumMg = rawSodium < 1.0
            ? Number((rawSodium * 1000).toFixed(1))
            : Number(rawSodium.toFixed(1));
        }
      }

      // Sanitize: pure NaCl contains 39,340 mg Na / 100g; > 40,000 mg is physically impossible
      if (sodiumMg !== undefined && sodiumMg > 40000) {
        sodiumMg = undefined;
      }
    } else if (saltG !== undefined && saltG >= 0) {
      // Sodium absent but salt present: derive sodium stoichiometrically (NaCl ~39.34% Na)
      sodiumMg = Number((saltG * 400.0).toFixed(1));
    }

    const fiberG = this.numberOrUndef(nutriments['fiber_100g']);

    // Check if at least core energy or macros exist
    if (energyKcal === undefined && proteinG === undefined && carbsG === undefined) {
      return null;
    }

    // --- DATA SANITIZATION & HIERARCHY CLEANSING ---
    // Rule 1: Macros cannot exceed 100g per 100g
    if (proteinG !== undefined && proteinG > 100) proteinG = undefined;
    if (carbsG !== undefined && carbsG > 100) carbsG = undefined;
    if (totalFatG !== undefined && totalFatG > 100) totalFatG = undefined;

    // Rule 2: Total sugars cannot exceed carbohydrates
    if (totalSugarG !== undefined) {
      if (totalSugarG > 100 || (carbsG !== undefined && totalSugarG > carbsG)) {
        // Discard corrupt sugar estimate
        totalSugarG = undefined;
      }
    }

    // Rule 3: Added sugars cannot exceed total sugars or 100g (e.g. OFF Britannia Bourbon listing having 113.6g)
    if (addedSugarG !== undefined) {
      if (addedSugarG > 100 || (totalSugarG !== undefined && addedSugarG > totalSugarG)) {
        // Discard impossible added sugar estimate
        addedSugarG = undefined;
      }
    }

    // Rule 4: Saturated fat and trans fat cannot exceed total fat
    if (saturatedFatG !== undefined) {
      if (saturatedFatG > 100 || (totalFatG !== undefined && saturatedFatG > totalFatG)) {
        saturatedFatG = undefined;
      }
    }
    if (transFatG !== undefined) {
      if (transFatG > 100 || (totalFatG !== undefined && transFatG > totalFatG)) {
        transFatG = undefined;
      }
    }

    // Rule 5: Sum of declared macros cannot exceed 105g (5% margin for moisture/analytical tolerance)
    const macroSum = (proteinG ?? 0) + (carbsG ?? 0) + (totalFatG ?? 0);
    if (macroSum > 105) {
      return null; // Corrupted row in community database
    }

    // Build evidence map with explicit TRANSCRIBED_UNVERIFIED provenance
    const gtin = p.code || 'unknown';
    const nutritionEvidence: NutritionEvidenceMap = {};
    const fieldList: Array<[NutritionField, number | undefined]> = [
      ['energyKcal', energyKcal],
      ['proteinG', proteinG],
      ['carbsG', carbsG],
      ['totalSugarG', totalSugarG],
      ['addedSugarG', addedSugarG],
      ['totalFatG', totalFatG],
      ['saturatedFatG', saturatedFatG],
      ['transFatG', transFatG],
      ['cholesterolMg', cholesterolMg],
      ['sodiumMg', sodiumMg],
      ['saltG', saltG],
      ['fiberG', fiberG],
    ];

    for (const [field, val] of fieldList) {
      if (val !== undefined) {
        nutritionEvidence[field] = {
          kind: 'MANUFACTURER_LABEL',
          sourceId: `OPEN_FOOD_FACTS:${gtin}`,
          sourceTitle: 'Open Food Facts Community Repository',
          publisher: 'Open Food Facts (ODbL License)',
          basis: nutritionBasis,
          locator: `nutriments:${field}`,
          verificationStatus: 'TRANSCRIBED_UNVERIFIED',
        };
      }
    }

    return {
      productName,
      brand,
      category,
      form: isLiquid ? 'LIQUID' : 'SOLID',
      nutritionBasis,
      nutritionContext: 'PACKAGED_PRODUCT',
      servingSizeGrams,
      energyKcal,
      proteinG,
      carbsG,
      totalSugarG,
      addedSugarG,
      totalFatG,
      saturatedFatG,
      transFatG,
      cholesterolMg,
      sodiumMg,
      saltG,
      fiberG,
      ingredientsText: p.ingredients_text || undefined,
      nutritionEvidence,
    };
  }

  private static numberOrUndef(val: unknown): number | undefined {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return undefined;
  }
}
