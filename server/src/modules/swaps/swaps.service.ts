import { ProductsService } from '../products/products.service.js';
import { IngredientParser } from '../engine/ingredient-parser.js';
import { EvaluationService } from '../engine/evaluation.service.js';
import { calculateDelta, rankCandidates, type EvaluatedCandidate } from './swaps.ranking.js';
import type { SwapQuery } from './swaps.schema.js';
import type { SwapResponse, SwapItem } from './swaps.types.js';
import { ARTIFICIAL_SWEETENERS } from '../engine/reference-standards.js';

export class SwapsService {
  private productsService: ProductsService;

  constructor() {
    this.productsService = new ProductsService();
  }

  private static categorySlug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  private static emptyResponse(
    scanned: Awaited<ReturnType<ProductsService['getProductByBarcode']>>['product'],
    persona: SwapQuery['persona'],
    reason: string,
    baseline?: {
      pricePer100g: number | null;
      hfssBreachCount: number | null;
      addedSugar100g: number | null;
      sodiumMg100g: number | null;
      saturatedFat100g: number | null;
    }
  ): SwapResponse {
    return {
      scannedProduct: {
        barcodeGtin: scanned.barcodeGtin,
        productName: scanned.productName,
        brandName: scanned.brandName,
        category: scanned.categorySlug,
        mrpInr: scanned.mrpInr,
        packageWeightG: scanned.packageWeightG ?? null,
        pricePer100g: baseline?.pricePer100g ?? null,
        hfssBreachCount: baseline?.hfssBreachCount ?? null,
        addedSugar100g: baseline?.addedSugar100g ?? null,
        sodiumMg100g: baseline?.sodiumMg100g ?? null,
        saturatedFat100g: baseline?.saturatedFat100g ?? null,
      },
      persona,
      isAlreadyOptimal: false,
      swapsCount: 0,
      swaps: [],
      noSwapsReason: reason,
    };
  }

  /**
   * Discovers same-aisle healthier swaps using transparent lexicographic
   * sorting. A product is eligible only if BOTH the scanned item and the
   * candidate are source-verified, complete, and gradeable. Unverified seeds and
   * label-incomplete products are never recommended.
   */
  public async findSwaps(barcode: string, query: SwapQuery): Promise<SwapResponse> {
    const scannedResult = await this.productsService.getProductByBarcode(barcode);
    const scanned = scannedResult.product;
    const scannedEval = scannedResult.evaluation;
    const norm = scannedEval.normalizedNutrition.per100g;

    const scannedWeight = scanned.packageWeightG > 0 ? scanned.packageWeightG : null;
    const scannedPricePer100g = scannedWeight !== null && scanned.mrpInr > 0
      ? Math.round(((scanned.mrpInr / scannedWeight) * 100) * 100) / 100
      : 0;

    if (!scanned.isVerified || !scannedEval.isGraded) {
      return SwapsService.emptyResponse(
        scanned,
        query.persona,
        'The scanned product is not source-verified or its label is not complete. A swap cannot be ranked against an unverified baseline.'
      );
    }

    if (scannedPricePer100g <= 0) {
      return SwapsService.emptyResponse(
        scanned,
        query.persona,
        'The scanned product has no usable price per 100 g; price-parity swap ranking is disabled.'
      );
    }

    if (norm.addedSugarG === null
      || norm.sodiumMg === null
      || norm.saturatedFatG === null
      || norm.energyKcal === null
      || norm.fiberG === null) {
      return SwapsService.emptyResponse(
        scanned,
        query.persona,
        'The scanned product is missing a comparison field (added sugar, sodium, saturated fat, energy, or fibre). Missing is not treated as zero.',
        {
          pricePer100g: scannedPricePer100g,
          hfssBreachCount: scannedEval.table151HfssChecks.filter((item) => item.isBreached === true).length,
          addedSugar100g: norm.addedSugarG,
          sodiumMg100g: norm.sodiumMg,
          saturatedFat100g: norm.saturatedFatG,
        }
      );
    }

    const scannedAddedSugar = norm.addedSugarG;
    const scannedSodium = norm.sodiumMg;
    const scannedSatFat = norm.saturatedFatG;
    const scannedEnergy = norm.energyKcal;
    const scannedFiber = norm.fiberG;
    const scannedHfssBreaches = scannedEval.table151HfssChecks.filter((item) => item.isBreached === true).length;

    const evaluatedCandidates: EvaluatedCandidate[] = [];
    const catalog = await this.productsService.listCatalogForSwaps();

    for (const item of catalog) {
      if (item.barcodeGtin === scanned.barcodeGtin) continue;
      if (!item.isVerified) continue;
      // A per-100 g and a per-100 ml figure are not interchangeable. Require
      // the candidate to use the same declaration basis as the scanned product.
      if (item.nutritionBasis !== scanned.nutritionBasis) continue;

      const itemCatSlug = SwapsService.categorySlug(item.category);
      const scannedCatLower = scanned.categorySlug.toLowerCase();
      const isSameCategory =
        itemCatSlug === scannedCatLower
        || item.category.toLowerCase() === scannedCatLower
        || (query.allowCrossCategory && item.form === scanned.form);
      if (!isSameCategory) continue;

      if (!item.packageWeightGrams || item.packageWeightGrams <= 0 || item.mrpInr <= 0) continue;
      const itemPricePer100g = Math.round(((item.mrpInr / item.packageWeightGrams) * 100) * 100) / 100;
      const priceRatio = itemPricePer100g / scannedPricePer100g;
      // Cheaper alternatives are always allowed; only a price premium beyond the
      // caller's ceiling is rejected. There is no artificial lower price floor.
      if (priceRatio > query.maxPriceRatio) continue;

      const candidateEval = EvaluationService.evaluate(item);
      if (!candidateEval.isGraded) continue;

      const candidateNutrition = candidateEval.normalizedNutrition.per100g;
      const candidateEnergy = candidateNutrition.energyKcal;
      const candidateProtein = candidateNutrition.proteinG;
      const candidateCarbs = candidateNutrition.carbsG;
      const candidateAddedSugar = candidateNutrition.addedSugarG;
      const candidateTotalSugar = candidateNutrition.totalSugarG;
      const candidateSatFat = candidateNutrition.saturatedFatG;
      const candidateSodium = candidateNutrition.sodiumMg;
      const candidateFiber = candidateNutrition.fiberG;
      const candidateTransFat = candidateNutrition.transFatG;

      if (candidateEnergy === null
        || candidateProtein === null
        || candidateCarbs === null
        || candidateAddedSugar === null
        || candidateTotalSugar === null
        || candidateSatFat === null
        || candidateSodium === null
        || candidateFiber === null) {
        continue;
      }

      const parsed = IngredientParser.parse(item.ingredientsText);

      if (query.allergens && query.allergens.length > 0) {
        const candidateAllergens = new Set([
          ...parsed.statutoryAllergenTags,
          ...parsed.mayContainAllergenTags,
        ]);
        if (query.allergens.some((allergen) => candidateAllergens.has(allergen))) continue;
      }

      if (query.persona === 'INFANT' && candidateAddedSugar > 0) continue;

      if (query.persona === 'CHILD') {
        const hasArtificialSweeteners = parsed.decoded.some(
          (decoded) => decoded.insCode && ARTIFICIAL_SWEETENERS[decoded.insCode]
        );
        if (hasArtificialSweeteners) continue;
      }

      if (query.persona === 'RENAL' && parsed.decoded.some((decoded) => decoded.insCode?.toLowerCase() === '508')) {
        continue;
      }

      evaluatedCandidates.push({
        barcodeGtin: item.barcodeGtin,
        productName: item.productName,
        brandName: item.brand,
        category: item.category,
        mrpInr: item.mrpInr,
        packageWeightG: item.packageWeightGrams,
        pricePer100g: itemPricePer100g,
        energyKcal100g: candidateEnergy,
        proteinG100g: candidateProtein,
        carbsG100g: candidateCarbs,
        addedSugar100g: candidateAddedSugar,
        totalSugar100g: candidateTotalSugar,
        saturatedFat100g: candidateSatFat,
        // Ranking sentinel only. It is never printed as a nutrient value.
        transFat100g: candidateTransFat ?? Number.POSITIVE_INFINITY,
        sodiumMg100g: candidateSodium,
        dietaryFiber100g: candidateFiber,
        hfssBreachCount: candidateEval.table151HfssChecks.filter((check) => check.isBreached === true).length,
        allergenTags: parsed.statutoryAllergenTags,
        highGiCarbTags: parsed.decoded
          .filter((decoded) => decoded.category === 'HIGH_GI_CARB')
          .map((decoded) => decoded.normalizedName),
        insCodes: parsed.decoded.filter((decoded) => decoded.insCode).map((decoded) => decoded.insCode!),
      });
    }

    const qualifyingHealthier = evaluatedCandidates.filter((candidate) => {
      if (scannedHfssBreaches === 0 && scannedAddedSugar === 0) {
        return candidate.hfssBreachCount === 0
          && candidate.addedSugar100g === 0
          && (candidate.sodiumMg100g < scannedSodium || candidate.dietaryFiber100g > scannedFiber);
      }

      const hasFewerBreaches = candidate.hfssBreachCount < scannedHfssBreaches;
      const hasLowerSugar = candidate.addedSugar100g <= scannedAddedSugar * 0.8;
      const hasLowerSodium = candidate.sodiumMg100g <= scannedSodium * 0.8;
      const hasLowerFat = candidate.saturatedFat100g <= scannedSatFat * 0.8;
      // A fibre advantage is only meaningful here when it is material (at least
      // 20% and 1 g/100 g more) and does not come with more added sugar.
      const hasMoreFiber = candidate.dietaryFiber100g >= scannedFiber * 1.2
        && candidate.dietaryFiber100g - scannedFiber >= 1
        && candidate.addedSugar100g <= scannedAddedSugar;
      return hasFewerBreaches || hasLowerSugar || hasLowerSodium || hasLowerFat || hasMoreFiber;
    });

    const isAlreadyOptimal = scannedHfssBreaches === 0
      && scannedAddedSugar === 0
      && qualifyingHealthier.length === 0;

    if (isAlreadyOptimal) {
      return {
        scannedProduct: {
          barcodeGtin: scanned.barcodeGtin,
          productName: scanned.productName,
          brandName: scanned.brandName,
          category: scanned.categorySlug,
          mrpInr: scanned.mrpInr,
          packageWeightG: scanned.packageWeightG,
          pricePer100g: scannedPricePer100g,
          hfssBreachCount: scannedHfssBreaches,
          addedSugar100g: scannedAddedSugar,
          sodiumMg100g: scannedSodium,
          saturatedFat100g: scannedSatFat,
        },
        persona: query.persona,
        isAlreadyOptimal: true,
        message:
          'No verified same-aisle candidate had fewer assessed DGI breaches, less added sugar, or a lower sodium/saturated-fat load at the selected price parity.',
        swapsCount: 0,
        swaps: [],
      };
    }

    const rankedCandidates = rankCandidates(qualifyingHealthier, query.persona);
    const topCandidates = rankedCandidates.slice(0, query.limit);

    const swaps: SwapItem[] = topCandidates.map((candidate) => {
      const priceRatioVsScanned = Math.round((candidate.pricePer100g / scannedPricePer100g) * 100) / 100;

      const deltaSugar = calculateDelta('Added Sugar', scannedAddedSugar, candidate.addedSugar100g, 'g', true);
      const deltaSodium = calculateDelta('Sodium', scannedSodium, candidate.sodiumMg100g, 'mg', true);
      const deltaSatFat = calculateDelta('Saturated Fat', scannedSatFat, candidate.saturatedFat100g, 'g', true);
      const deltaFiber = calculateDelta('Dietary Fiber', scannedFiber, candidate.dietaryFiber100g, 'g', false);
      const deltaCalories = calculateDelta('Energy', scannedEnergy, candidate.energyKcal100g, 'kcal', true);
      const deltaPrice = calculateDelta('Price per 100g', scannedPricePer100g, candidate.pricePer100g, '₹', true);

      const keyAdvantages: string[] = [];
      if (deltaSugar.isImprovement && deltaSugar.percentDelta <= -20) {
        keyAdvantages.push(`${Math.abs(deltaSugar.percentDelta)}% less added sugar (${deltaSugar.absoluteDelta}g/100g)`);
      } else if (candidate.addedSugar100g === 0 && scannedAddedSugar > 0) {
        keyAdvantages.push(`100% eliminated added sugar (0g vs ${scannedAddedSugar}g)`);
      }

      if (deltaSodium.isImprovement && deltaSodium.percentDelta <= -20) {
        keyAdvantages.push(`${Math.abs(deltaSodium.percentDelta)}% lower sodium (${deltaSodium.absoluteDelta}mg/100g)`);
      }

      if (deltaSatFat.isImprovement && deltaSatFat.percentDelta <= -20) {
        keyAdvantages.push(`${Math.abs(deltaSatFat.percentDelta)}% less saturated fat (${deltaSatFat.absoluteDelta}g/100g)`);
      }

      if (deltaFiber.isImprovement && deltaFiber.percentDelta >= 20 && deltaFiber.absoluteDelta >= 1) {
        keyAdvantages.push(`+${deltaFiber.percentDelta}% more dietary fibre (+${deltaFiber.absoluteDelta}g/100g)`);
      }

      if (candidate.hfssBreachCount < scannedHfssBreaches) {
        keyAdvantages.push(
          candidate.hfssBreachCount === 0
            ? `No assessed DGI Table 15.1 threshold breached (${scannedHfssBreaches} fewer than the scanned item)`
            : `${scannedHfssBreaches - candidate.hfssBreachCount} fewer assessed DGI threshold breaches`
        );
      }

      if (deltaPrice.absoluteDelta <= 0) {
        keyAdvantages.push(
          deltaPrice.absoluteDelta === 0
            ? `Exact price parity (₹${candidate.pricePer100g.toFixed(2)}/100g)`
            : `${Math.abs(deltaPrice.percentDelta)}% lower price per 100g (saves ₹${Math.abs(deltaPrice.absoluteDelta).toFixed(2)})`
        );
      }

      const tradeOffs: string[] = [];
      if (candidate.hfssBreachCount > 0) {
        tradeOffs.push(
          `Still breaches ${candidate.hfssBreachCount} DGI Table 15.1 threshold(s) (e.g. added sugar/energy/salt). It is a relative improvement, not an unrestricted health food.`
        );
      }

      if (!deltaSodium.isImprovement && deltaSodium.absoluteDelta > 50) {
        tradeOffs.push(`Higher sodium: ${candidate.sodiumMg100g}mg vs ${scannedSodium}mg (+${deltaSodium.absoluteDelta}mg/100g)`);
      }

      if (!deltaSatFat.isImprovement && deltaSatFat.absoluteDelta > 1.0) {
        tradeOffs.push(`Higher saturated fat: ${candidate.saturatedFat100g}g vs ${scannedSatFat}g (+${deltaSatFat.absoluteDelta}g/100g)`);
      }

      if (priceRatioVsScanned > 1.05) {
        const premiumPct = Math.round((priceRatioVsScanned - 1.0) * 100);
        tradeOffs.push(`+${premiumPct}% price premium (₹${candidate.pricePer100g.toFixed(2)} vs ₹${scannedPricePer100g.toFixed(2)}/100g)`);
      }

      return {
        id: `swap-${candidate.barcodeGtin}`,
        barcodeGtin: candidate.barcodeGtin,
        productName: candidate.productName,
        brandName: candidate.brandName,
        category: candidate.category,
        mrpInr: candidate.mrpInr,
        packageWeightG: candidate.packageWeightG,
        pricePer100g: candidate.pricePer100g,
        priceRatioVsScanned,
        energyKcal100g: candidate.energyKcal100g,
        addedSugar100g: candidate.addedSugar100g,
        saturatedFat100g: candidate.saturatedFat100g,
        sodiumMg100g: candidate.sodiumMg100g,
        dietaryFiber100g: candidate.dietaryFiber100g,
        proteinG100g: candidate.proteinG100g,
        hfssBreachCount: candidate.hfssBreachCount,
        keyAdvantages,
        tradeOffs,
        deltas: {
          addedSugar: deltaSugar,
          sodium: deltaSodium,
          saturatedFat: deltaSatFat,
          dietaryFiber: deltaFiber,
          energyKcal: deltaCalories,
          price: deltaPrice,
        },
      };
    });

    let noSwapsReason: string | undefined;
    if (swaps.length === 0) {
      noSwapsReason = query.allergens && query.allergens.length > 0
        ? `No source-verified healthier alternative in this category within the price-premium ceiling is free from: ${query.allergens.join(', ')}.`
        : 'No source-verified healthier alternative in this category met the price-premium ceiling and completeness rules.';
    }

    return {
      scannedProduct: {
        barcodeGtin: scanned.barcodeGtin,
        productName: scanned.productName,
        brandName: scanned.brandName,
        category: scanned.categorySlug,
        mrpInr: scanned.mrpInr,
        packageWeightG: scanned.packageWeightG,
        pricePer100g: scannedPricePer100g,
        hfssBreachCount: scannedHfssBreaches,
        addedSugar100g: scannedAddedSugar,
        sodiumMg100g: scannedSodium,
        saturatedFat100g: scannedSatFat,
      },
      persona: query.persona,
      isAlreadyOptimal: false,
      swapsCount: swaps.length,
      swaps,
      noSwapsReason,
    };
  }
}
