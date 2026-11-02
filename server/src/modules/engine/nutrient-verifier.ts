import type {
  RawNutritionInput,
  NormalizedNutrition,
  ConsistencyAuditResult,
  DeclaredValueSource,
} from './types.js';

const ATWATER_HIGH_TOLERANCE = 0.08; // <= 8% Pass (HIGH confidence)
const ATWATER_MAX_TOLERANCE = 0.20;  // 8% - 20% Warning (SUSPECT); > 20% Fail (CORRUPT)

export class NutrientVerifier {
  /**
   * Normalize only values that were actually supplied.
   *
   * Missing is represented as null. It is never silently changed to zero,
   * and total sugar is never used as a proxy for added sugar. Sodium/salt
   * equivalence is a transparent unit conversion, not a nutrition estimate.
   */
  public static normalize(raw: RawNutritionInput): NormalizedNutrition {
    const servingSize = raw.servingSizeGrams !== undefined
      && Number.isFinite(raw.servingSizeGrams)
      && raw.servingSizeGrams > 0
      ? raw.servingSizeGrams
      : null;
    const factorToServing = servingSize === null ? null : servingSize / 100.0;
    const basis = raw.nutritionBasis;

    let sodiumMg = this.valueOrNull(raw.sodiumMg);
    let saltG = this.valueOrNull(raw.saltG);

    if (sodiumMg === null && saltG !== null) {
      sodiumMg = Number((saltG * 400).toFixed(1));
    } else if (sodiumMg !== null && saltG === null) {
      saltG = Number(((sodiumMg * 2.5) / 1000).toFixed(2));
    }

    const totalSugar = this.valueOrNull(raw.totalSugarG);
    const addedSugarDeclared = raw.addedSugarG !== undefined;
    const addedSugarSource: DeclaredValueSource = addedSugarDeclared ? 'DECLARED' : 'NOT_DECLARED';
    const addedSugar = addedSugarDeclared ? this.valueOrNull(raw.addedSugarG) : null;
    const isAddedSugarEstimated = false;

    const totalFat = this.valueOrNull(raw.totalFatG);
    const addedFat = this.valueOrNull(raw.addedFatG);
    const saturatedFat = this.valueOrNull(raw.saturatedFatG);
    const transFat = this.valueOrNull(raw.transFatG);
    const cholesterol = this.valueOrNull(raw.cholesterolMg);
    const fiber = this.valueOrNull(raw.fiberG);
    const protein = this.valueOrNull(raw.proteinG);
    const carbs = this.valueOrNull(raw.carbsG);
    const energy = this.valueOrNull(raw.energyKcal);

    const per100g = {
      energyKcal: energy,
      proteinG: protein,
      carbsG: carbs,
      totalSugarG: totalSugar,
      addedSugarG: addedSugar,
      isAddedSugarEstimated,
      addedSugarSource,
      addedFatG: addedFat,
      totalFatG: totalFat,
      saturatedFatG: saturatedFat,
      transFatG: transFat,
      cholesterolMg: cholesterol,
      sodiumMg,
      saltG,
      fiberG: fiber,
    };

    const perServing = {
      servingSizeGrams: servingSize,
      energyKcal: this.scaleForServing(energy, factorToServing, 1),
      proteinG: this.scaleForServing(protein, factorToServing, 1),
      carbsG: this.scaleForServing(carbs, factorToServing, 1),
      totalSugarG: this.scaleForServing(totalSugar, factorToServing, 1),
      addedSugarG: this.scaleForServing(addedSugar, factorToServing, 1),
      isAddedSugarEstimated,
      addedSugarSource,
      addedFatG: this.scaleForServing(addedFat, factorToServing, 1),
      totalFatG: this.scaleForServing(totalFat, factorToServing, 1),
      saturatedFatG: this.scaleForServing(saturatedFat, factorToServing, 1),
      transFatG: this.scaleForServing(transFat, factorToServing, 2),
      cholesterolMg: this.scaleForServing(cholesterol, factorToServing, 1),
      sodiumMg: this.scaleForServing(sodiumMg, factorToServing, 1),
      saltG: this.scaleForServing(saltG, factorToServing, 2),
      fiberG: this.scaleForServing(fiber, factorToServing, 1),
    };

    return { basis, per100g, perServing };
  }

  private static valueOrNull(value: number | undefined): number | null {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
  }

  private static scaleForServing(value: number | null, factor: number | null, decimals: number): number | null {
    if (value === null || factor === null) return null;
    return Number((value * factor).toFixed(decimals));
  }

  /** Evaluates packaging-label mathematical plausibility without inventing data. */
  public static auditConsistency(normalized: NormalizedNutrition): ConsistencyAuditResult {
    const p = normalized.per100g;
    const notes: string[] = [];

    const macrosAvailable = p.proteinG !== null && p.carbsG !== null && p.totalFatG !== null;
    const energyAvailable = p.energyKcal !== null;

    /**
     * Standard label Atwater check: 4 kcal/g protein, 4 kcal/g carbohydrate,
     * 9 kcal/g fat. Fibre is deliberately not added: Indian labels commonly
     * include fibre within the carbohydrate line, and adding 2 kcal/g again
     * would double-count it. The 20% tolerance covers label rounding and
     * carbohydrate/fibre conventions.
     */
    const calculatedKcal = macrosAvailable
      ? Number((p.proteinG! * 4 + p.carbsG! * 4 + p.totalFatG! * 9).toFixed(1))
      : null;
    const declaredKcal = p.energyKcal;
    const discrepancyRatio = energyAvailable && calculatedKcal !== null
      ? declaredKcal! > 0
        ? Math.abs(calculatedKcal - declaredKcal!) / declaredKcal!
        // A declared zero-energy product cannot contain non-zero macros.
        : calculatedKcal > 0
          ? 1
          : 0
      : null;
    const discrepancyPercent = discrepancyRatio === null ? null : Number((discrepancyRatio * 100).toFixed(1));
    const atwaterPassed = discrepancyRatio !== null && discrepancyRatio <= ATWATER_MAX_TOLERANCE;
    const atwaterHighConfidence = discrepancyRatio !== null && discrepancyRatio <= ATWATER_HIGH_TOLERANCE;

    if (discrepancyRatio === null) {
      notes.push('Energy or all required macronutrients were not declared; caloric consistency cannot be confirmed.');
    } else if (discrepancyRatio > ATWATER_MAX_TOLERANCE) {
      notes.push(
        `Declared energy differs from the Atwater calculation by ${discrepancyPercent}% (exceeds ${ATWATER_MAX_TOLERANCE * 100}% tolerance limit; marked as corrupt).`
      );
    } else if (!atwaterHighConfidence) {
      notes.push(
        `Declared energy differs from the Atwater calculation by ${discrepancyPercent}% (within ${ATWATER_MAX_TOLERANCE * 100}% regulatory tolerance, but exceeds ${ATWATER_HIGH_TOLERANCE * 100}% high-confidence threshold).`
      );
    }

    const atwaterReason = discrepancyRatio === null
      ? 'Caloric consistency is unavailable because one or more required declared values are missing.'
      : atwaterHighConfidence
        ? `Caloric calculation is consistent (declared ${declaredKcal} kcal vs calculated ${calculatedKcal} kcal, ${discrepancyPercent}% difference within the 8% high-confidence tolerance).`
        : atwaterPassed
          ? `Caloric calculation has minor variance (declared ${declaredKcal} kcal vs calculated ${calculatedKcal} kcal, ${discrepancyPercent}% difference within 20% regulatory tolerance but exceeds 8% precision threshold).`
          : `Caloric calculation is implausible (declared ${declaredKcal} kcal vs calculated ${calculatedKcal} kcal, ${discrepancyPercent}% difference exceeds the 20% tolerance limit).`;

    const massAvailable = macrosAvailable;
    const totalMacroGrams = massAvailable
      ? Number((p.proteinG! + p.carbsG! + p.totalFatG!).toFixed(1))
      : null;
    const massPassed = totalMacroGrams !== null && totalMacroGrams <= 100.0;
    const massReason = massPassed
      ? `Macronutrient total (${totalMacroGrams}g per 100g) is within physical limits.`
      : totalMacroGrams === null
        ? 'Macronutrient mass cannot be checked because protein, carbohydrate, or fat is missing.'
        : `Data error: Macronutrients total ${totalMacroGrams}g per 100g, physically exceeding package mass.`;

    const sugarInCarbsPassed = p.totalSugarG !== null && p.carbsG !== null && p.totalSugarG <= p.carbsG;
    if (!sugarInCarbsPassed) notes.push('Sugar/carbohydrate consistency cannot be confirmed or the declared sugar exceeds carbohydrates.');

    const addedInTotalSugarPassed = p.addedSugarG !== null && p.totalSugarG !== null && p.addedSugarG <= p.totalSugarG;
    if (!addedInTotalSugarPassed) notes.push('Added sugar is not declared or exceeds total sugar; it is not inferred.');

    const addedFatInTotalPassed = p.addedFatG === null
      || (p.totalFatG !== null && p.addedFatG <= p.totalFatG);
    if (!addedFatInTotalPassed) {
      notes.push('Added fat is not declared with a usable total fat value or exceeds total fat.');
    }

    const fatComponentsPassed = p.saturatedFatG !== null
      && p.totalFatG !== null
      && p.saturatedFatG <= p.totalFatG
      && (p.transFatG === null || p.saturatedFatG + p.transFatG <= p.totalFatG)
      && addedFatInTotalPassed;
    if (!fatComponentsPassed) {
      notes.push('Fat-component consistency cannot be confirmed or saturated/trans/added fat exceeds total fat.');
    } else if (p.transFatG === null) {
      notes.push('Trans fat is not declared; it is not assumed to be zero, but saturated fat alone is within total fat.');
    }

    let sodiumSaltPassed = p.sodiumMg !== null && p.saltG !== null;
    let sodiumSaltMismatch = false;
    if (!sodiumSaltPassed) {
      notes.push('Neither sodium nor salt is declared; no zero value is assumed.');
    } else {
      const sodiumFromSalt = p.saltG! * 400;
      const sodiumSaltTolerance = Math.max(25, p.sodiumMg! * 0.1);
      if (Math.abs(p.sodiumMg! - sodiumFromSalt) > sodiumSaltTolerance) {
        sodiumSaltMismatch = true;
        sodiumSaltPassed = false;
        notes.push(
          `Label inconsistency: Sodium (${p.sodiumMg}mg) does not match declared salt (${p.saltG}g; approximately ${Number(sodiumFromSalt.toFixed(1))}mg sodium).`
        );
      }
    }

    const labelConsistencyPassed = sugarInCarbsPassed
      && addedInTotalSugarPassed
      && fatComponentsPassed
      && sodiumSaltPassed;

    let overallConfidence: 'HIGH' | 'SUSPECT' | 'CORRUPT' = 'HIGH';
    if ((totalMacroGrams !== null && totalMacroGrams > 100.0)
      || (discrepancyRatio !== null && discrepancyRatio > ATWATER_MAX_TOLERANCE)
      || sodiumSaltMismatch) {
      overallConfidence = 'CORRUPT';
    } else if (!atwaterHighConfidence || !labelConsistencyPassed) {
      overallConfidence = 'SUSPECT';
    }

    return {
      isPlausible: overallConfidence !== 'CORRUPT',
      atwaterEnergy: {
        declaredKcal,
        calculatedKcal,
        discrepancyPercent,
        passed: atwaterPassed,
        reason: atwaterReason,
      },
      massConservation: {
        totalMacroGramsPer100g: totalMacroGrams,
        passed: massPassed,
        reason: massReason,
      },
      labelConsistency: {
        passed: labelConsistencyPassed,
        notes,
      },
      overallConfidence,
    };
  }
}
