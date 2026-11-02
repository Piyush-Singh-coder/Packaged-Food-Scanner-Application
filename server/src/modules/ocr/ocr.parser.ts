import type { FoodForm, NutritionDeclarationBasis } from '../engine/types.js';
import type {
  ExtractedPackagingData,
  ExtractedNutritionValues,
  OcrDeclaredBasis,
} from './ocr.types.js';
import { extractFssaiLicensesFromText } from '../../common/utils/fssai.js';

interface NumericToken {
  value: number;
  unit?: 'kcal' | 'kj' | 'g' | 'mg' | 'ml';
}

interface ParsedNutrient {
  per100?: number;
  perServing?: number;
}

const NUTRIENT_STOP = /^(?:ingredients?|contains?|may\s+contain|allergen|storage|best\s*before|use\s*by|mfg|manufactured|marketed|fssai|lic(?:ence)?|batch|net\s*(?:qty|weight)|mrp)\b/i;
const INGREDIENT_TAIL_STOP = /^(?:storage|best\s*before|use\s*by|mfg|manufactured|marketed|fssai|lic(?:ence)?|batch|net\s*(?:qty|weight)|mrp|nutrition(?:al)?\s*(?:information|facts)?)\b/i;
const ALLERGEN_LINE = /^(?:contains?|may\s+contain)\b/i;

export class OcrParser {
  /**
   * Parses raw OCR packaging text into structured product metadata and
   * nutrition values. The parser is deliberately unit-aware:
   * - kJ is converted to kcal, never treated as kcal;
   * - "per 100 g" is never used as a nutrient value;
   * - sodium/salt are read only from the nutrition table, not ingredients;
   * - per-serving values are converted to per-100 only when a serving size is
   *   actually declared.
   */
  public static parse(rawText: string): ExtractedPackagingData {
    const cleanText = rawText.replace(/\r\n/g, '\n');
    const lines = cleanText.split('\n').map((line) => line.trim()).filter(Boolean);

    const brandMatch = cleanText.match(/(?:brand|mfg\.?\s*by|marketed\s*by)\s*[:|-]?\s*([^\n,]+)/i);
    const productMatch = cleanText.match(/(?:product|item\s*name)\s*[:|-]?\s*([^\n,]+)/i);
    let brandName = brandMatch?.[1].trim();
    let productName = productMatch?.[1].trim();

    if (!productName) {
      for (const line of lines.slice(0, 5)) {
        if (line.match(/nutri|ingred|fssai|batch|exp|mrp|net|energy|protein|fat|carb|sugar|sodium|salt|cholesterol|fib(?:re|er)|serving|per\s*100|contains?|may\s+contain|storage|best\s*before|lic(?:ence)?/i)) continue;
        if (line.length < 3) continue;
        if (/\d+(?:\.\d+)?\s*(?:kcal|kj|g|mg|ml|%)\b/i.test(line)) continue;
        if (!brandName) brandName = line;
        else {
          productName = line;
          break;
        }
      }
    }

    const packageInfo = this.extractPackageWeight(cleanText);
    const servingSizeGrams = this.extractServingSize(cleanText);
    const mrpInr = this.extractMrp(cleanText);

    const nutritionStart = lines.findIndex((line) => /nutrition(?:al)?\s*(?:information|facts)?|typical\s+values/i.test(line));
    const nutritionEnd = nutritionStart >= 0
      ? lines.findIndex((line, index) => index > nutritionStart && NUTRIENT_STOP.test(line))
      : -1;
    const nutritionLines = nutritionStart >= 0
      ? lines.slice(nutritionStart, nutritionEnd > nutritionStart ? nutritionEnd : undefined)
      : lines.filter((line) => this.looksLikeNutrientLine(line));

    const headerText = nutritionLines.slice(0, 5).join(' ').toLowerCase();
    const hasPer100G = /per\s*100\s*(?:g|gm|gms|grams?)\b/i.test(headerText);
    const hasPer100Ml = /per\s*100\s*(?:ml|millilit(?:re|er)s?)\b/i.test(headerText);
    const hasPerServingColumn = /per\s*(?:serve|serving)\b/i.test(headerText);
    const hasPerServingLine = nutritionLines.some((line) => /per\s*(?:serve|serving)\b/i.test(line));
    const per100First = hasPer100G || hasPer100Ml
      ? !/per\s*(?:serve|serving)[\s\S]{0,80}per\s*100\s*(?:g|ml)/i.test(headerText)
      : true;

    const declaredBasis: OcrDeclaredBasis = hasPer100Ml
      ? 'PER_100ML'
      : hasPer100G
        ? 'PER_100G'
        : (hasPerServingColumn || hasPerServingLine)
          ? 'PER_SERVING'
          : 'UNKNOWN';

    const rawPer100: ExtractedNutritionValues = {};
    const rawPerServing: ExtractedNutritionValues = {};
    const extractionOptions = {
      per100First,
      hasPerServingColumn,
      hasPer100Declaration: hasPer100G || hasPer100Ml,
    };

    const energy = this.extractNutrient(nutritionLines, /energy|calories/i, {
      ...extractionOptions,
      energy: true,
    });
    rawPer100.energyKcal = energy.per100;
    rawPerServing.energyKcal = energy.perServing;

    const protein = this.extractNutrient(nutritionLines, /protein/i, extractionOptions);
    rawPer100.proteinG = protein.per100;
    rawPerServing.proteinG = protein.perServing;

    const carbs = this.extractNutrient(nutritionLines, /carbohydrate|carbohydrates|carbs/i, extractionOptions);
    rawPer100.carbsG = carbs.per100;
    rawPerServing.carbsG = carbs.perServing;

    const totalSugar = this.extractNutrient(
      nutritionLines,
      /(?:of\s+which\s+)?(?:total\s+)?sugars?/i,
      { ...extractionOptions, exclude: /added\s+sugars?/i }
    );
    rawPer100.totalSugarG = totalSugar.per100;
    rawPerServing.totalSugarG = totalSugar.perServing;

    const addedSugar = this.extractNutrient(nutritionLines, /added\s+sugars?/i, extractionOptions);
    rawPer100.addedSugarG = addedSugar.per100;
    rawPerServing.addedSugarG = addedSugar.perServing;

    const totalFat = this.extractNutrient(
      nutritionLines,
      /^(?:total\s+)?fat\b/i,
      { ...extractionOptions, exclude: /saturat|trans|of\s+which/i }
    );
    rawPer100.totalFatG = totalFat.per100;
    rawPerServing.totalFatG = totalFat.perServing;

    const saturatedFat = this.extractNutrient(nutritionLines, /saturat/i, extractionOptions);
    rawPer100.saturatedFatG = saturatedFat.per100;
    rawPerServing.saturatedFatG = saturatedFat.perServing;

    const transFat = this.extractNutrient(nutritionLines, /trans\s*fat/i, extractionOptions);
    rawPer100.transFatG = transFat.per100;
    rawPerServing.transFatG = transFat.perServing;

    const cholesterol = this.extractNutrient(nutritionLines, /cholesterol/i, extractionOptions);
    rawPer100.cholesterolMg = cholesterol.per100;
    rawPerServing.cholesterolMg = cholesterol.perServing;

    const sodium = this.extractNutrient(nutritionLines, /\bsodium\b/i, extractionOptions);
    rawPer100.sodiumMg = sodium.per100;
    rawPerServing.sodiumMg = sodium.perServing;

    const salt = this.extractNutrient(nutritionLines, /\bsalt\b/i, extractionOptions);
    rawPer100.saltG = salt.per100;
    rawPerServing.saltG = salt.perServing;

    const fiber = this.extractNutrient(nutritionLines, /fib(?:re|er)/i, extractionOptions);
    rawPer100.fiberG = fiber.per100;
    rawPerServing.fiberG = fiber.perServing;

    const per100g = this.dropUndefined(rawPer100);
    const perServing = this.dropUndefined(rawPerServing);
    const hasAnyPer100 = Object.keys(per100g).length > 0;
    const hasAnyPerServing = Object.keys(perServing).length > 0;

    const categoryText = [
      productName,
      brandName,
      ...lines.slice(0, nutritionStart >= 0 ? nutritionStart : Math.min(lines.length, 5)),
    ].filter(Boolean).join(' ');
    const category = this.classifyCategory(categoryText);
    // Use front-of-pack text only. Ingredient or allergen text (for example,
    // "wheat flour" in a beverage) must not change the product form.
    const form = this.classifyForm(categoryText, packageInfo.unit, hasPer100Ml, category);

    if (declaredBasis === 'PER_SERVING') {
      if (hasAnyPerServing && servingSizeGrams !== undefined) {
        const factor = 100 / servingSizeGrams;
        for (const [key, value] of Object.entries(perServing) as Array<[keyof ExtractedNutritionValues, number]>) {
          per100g[key] = this.roundForField(key, value * factor);
        }
      }
    } else if (hasAnyPer100 && servingSizeGrams !== undefined) {
      const factor = servingSizeGrams / 100;
      for (const [key, value] of Object.entries(per100g) as Array<[keyof ExtractedNutritionValues, number]>) {
        if (perServing[key] === undefined) perServing[key] = this.roundForField(key, value * factor);
      }
    }

    const hasAnyConvertedPer100 = Object.keys(per100g).length > 0;
    const packageIsVolume = packageInfo.unit === 'ml' || packageInfo.unit === 'l';
    // A per-serving liquid is only known to be per 100 ml when the pack itself
    // is declared by volume. A ketchup or sauce served in grams converts to
    // per 100 g even though its physical form is liquid.
    const nutritionBasis: NutritionDeclarationBasis | undefined = hasAnyConvertedPer100
      ? declaredBasis === 'PER_100ML' || (declaredBasis === 'PER_SERVING' && packageIsVolume)
        ? 'PER_100ML'
        : 'PER_100G'
      : undefined;

    const ingredientBlock = this.extractIngredients(lines, nutritionStart);
    const ingredientsText = ingredientBlock.ingredientsText;
    const mayContainStatement = ingredientBlock.mayContainStatement;
    const allergenStatement = ingredientBlock.allergenStatement;

    return {
      productName,
      brandName,
      category,
      form,
      nutritionBasis,
      declaredBasis,
      packageWeightGrams: packageInfo.grams,
      servingSizeGrams,
      mrpInr,
      per100g: hasAnyConvertedPer100 ? per100g : {},
      perServing: Object.keys(perServing).length > 0 ? perServing : undefined,
      ingredientsText,
      allergenStatement,
      mayContainStatement,
      fssaiLicenses: extractFssaiLicensesFromText(rawText),
    };
  }

  private static looksLikeNutrientLine(line: string): boolean {
    return /energy|calories|protein|carbohydrate|sugar|fat|saturat|trans|sodium|salt|fib(?:re|er)|cholesterol/i.test(line)
      && /\d/.test(line);
  }

  private static extractPackageWeight(text: string): { grams?: number; unit?: 'g' | 'ml' | 'l' | 'kg' } {
    const match = text.match(
      /(?:net\s*(?:wt\.?|weight|qty\.?|quantity|vol\.?|volume)|quantity)\s*[:|-]?\s*(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams|l|litre|liter|ml)\b/i
    );
    if (!match) return {};
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value) || value <= 0) return {};
    const unit = match[2].toLowerCase();
    if (unit === 'kg' || unit === 'l' || unit === 'litre' || unit === 'liter') {
      return { grams: value * 1000, unit: unit === 'kg' ? 'kg' : 'l' };
    }
    return { grams: value, unit: unit === 'ml' ? 'ml' : 'g' };
  }

  private static extractServingSize(text: string): number | undefined {
    const gramOrMl = '(\\d+(?:\\.\\d+)?)\\s*(g|gm|gms|grams?|ml)\\b';
    const labelled = text.match(new RegExp(
      `serving\\s*size[^\\n]*?(?:${gramOrMl}|\\(\\s*${gramOrMl}\\s*\\))`,
      'i'
    ));
    if (labelled) {
      const value = parseFloat(labelled[1] ?? labelled[3]);
      return Number.isFinite(value) && value > 0 ? value : undefined;
    }

    const perServing = text.match(new RegExp(
      `per\\s*(?:serve|serving)\\s*\\(?\\s*${gramOrMl}\\s*\\)?`,
      'i'
    ));
    const value = perServing ? parseFloat(perServing[1]) : undefined;
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private static extractMrp(text: string): number | undefined {
    const match = text.match(/(?:\bm\.?r\.?p\.?|\brs\.?|\binr|₹)\s*[:|-]?\s*(\d+(?:\.\d+)?)/i);
    if (!match) return undefined;
    const value = parseFloat(match[1]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private static extractNutrient(
    lines: string[],
    label: RegExp,
    options: {
      energy?: boolean;
      per100First: boolean;
      hasPerServingColumn: boolean;
      hasPer100Declaration: boolean;
      exclude?: RegExp;
    }
  ): ParsedNutrient {
    const line = lines.find((candidate) => label.test(candidate) && !options.exclude?.test(candidate));
    if (!line) return {};

    const lineHasPer100 = /per\s*100\s*(?:g|ml|gm|gms|grams?|millilit(?:re|er)s?)\b/i.test(line);
    const lineHasPerServing = /per\s*(?:serve|serving)\b/i.test(line);
    const tokens = this.numericTokens(line);
    if (tokens.length === 0) return {};

    const selection = {
      per100First: options.per100First,
      hasPerServingColumn: options.hasPerServingColumn,
      hasPer100Declaration: options.hasPer100Declaration,
      hasBothColumns: options.hasPer100Declaration && options.hasPerServingColumn,
      lineHasPer100,
      lineHasPerServing,
    };

    if (options.energy) {
      const kcalTokens = tokens.filter((token) => token.unit === 'kcal');
      if (kcalTokens.length > 0) {
        return this.selectColumn(kcalTokens, selection);
      }
      const kjTokens = tokens.filter((token) => token.unit === 'kj');
      if (kjTokens.length > 0) {
        const selected = this.selectColumn(kjTokens, selection);
        if (selected.per100 !== undefined) selected.per100 = Number((selected.per100 / 4.184).toFixed(1));
        if (selected.perServing !== undefined) selected.perServing = Number((selected.perServing / 4.184).toFixed(1));
        return selected;
      }
    }

    const valueTokens = tokens.filter((token) => token.unit !== 'kcal' && token.unit !== 'kj');
    return this.selectColumn(valueTokens, selection);
  }

  private static selectColumn(
    tokens: NumericToken[],
    options: {
      per100First: boolean;
      hasPerServingColumn: boolean;
      hasPer100Declaration: boolean;
      hasBothColumns: boolean;
      lineHasPer100: boolean;
      lineHasPerServing: boolean;
    }
  ): ParsedNutrient {
    if (tokens.length === 0) return {};

    if (tokens.length === 1) {
      if (options.lineHasPerServing) return { perServing: tokens[0].value };
      if (options.lineHasPer100) return { per100: tokens[0].value };
      if (options.hasBothColumns) {
        // A single number under a two-column header is ambiguous. Never guess
        // whether it is per 100 g/ml or per serving.
        return {};
      }
      if (options.hasPer100Declaration) return { per100: tokens[0].value };
      if (options.hasPerServingColumn) return { perServing: tokens[0].value };
      return {};
    }

    if (options.hasBothColumns) {
      const first = tokens[0].value;
      const second = tokens[1].value;
      return options.per100First
        ? { per100: first, perServing: second }
        : { per100: second, perServing: first };
    }

    if (options.lineHasPerServing && !options.lineHasPer100) {
      return { perServing: tokens[0].value };
    }

    if (options.lineHasPer100 || options.hasPer100Declaration) {
      return { per100: tokens[0].value };
    }

    if (options.hasPerServingColumn) {
      return { perServing: tokens[0].value };
    }

    return {};
  }

  private static numericTokens(line: string): NumericToken[] {
    const cleaned = line
      .replace(/\(\s*\d+(?:\.\d+)?\s*(?:g|gm|gms|grams?|ml)\s*\)/gi, ' ')
      .replace(/per\s*100\s*(?:g|gm|gms|grams?|ml|millilit(?:re|er)s?)\b/gi, ' ')
      .replace(/per\s*(?:serve|serving)(?:\s*size)?\s*(?:\([^)]*\))?/gi, ' ')
      .replace(/\b\d+(?:\.\d+)?\s*%/g, ' ')
      .trim();

    const tokens: NumericToken[] = [];
    const regex = /(\d+(?:\.\d+)?)\s*(kcal|kj|g|mg|ml)?/gi;
    for (const match of cleaned.matchAll(regex)) {
      const value = parseFloat(match[1]);
      const unit = match[2]?.toLowerCase() as NumericToken['unit'];
      if (!Number.isFinite(value)) continue;
      tokens.push({ value, unit });
    }
    return tokens;
  }

  private static dropUndefined(values: ExtractedNutritionValues): ExtractedNutritionValues {
    return Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined)
    ) as ExtractedNutritionValues;
  }

  private static roundForField(key: keyof ExtractedNutritionValues, value: number): number {
    return ['sodiumMg', 'cholesterolMg'].includes(key)
      ? Number(value.toFixed(1))
      : Number(value.toFixed(2));
  }

  private static extractIngredients(lines: string[], nutritionStart: number): {
    ingredientsText: string;
    allergenStatement?: string;
    mayContainStatement?: string;
  } {
    const start = lines.findIndex((line, index) =>
      (nutritionStart < 0 || index > nutritionStart) && /^ingredients?\b/i.test(line)
    );

    if (start < 0) {
      const fallback = lines
        .filter((line) => !this.looksLikeNutrientLine(line))
        .filter((line) => /flour|sugar|oil|salt|water|powder|extract|preservative|thickener|ins\s*\d/i.test(line));
      return { ingredientsText: fallback.join(' ').trim() };
    }

    const end = lines.findIndex((line, index) =>
      index > start
      && INGREDIENT_TAIL_STOP.test(line)
      && !ALLERGEN_LINE.test(line)
    );
    const blockLines = lines.slice(start, end > start ? end : undefined);
    const block = blockLines.join(' ').replace(/^ingredients?\s*[:\-]?\s*/i, '').trim();

    const mayContainLine = blockLines.find((line) => /^may\s+contain\b/i.test(line));
    const containsLine = blockLines.find((line) => /^contains?\b/i.test(line) && !/^may\s+contain\b/i.test(line));
    const mayContainMatch = block.match(/\bmay\s+contain\b\s*[:\-]?\s*([\s\S]*)$/i);
    const containsMatch = block.match(/(?:^|[\s,;])contains?\b\s*[:\-]?\s*([\s\S]*?)(?=\bmay\s+contain\b|$)/i);
    const allergenSplit = block.search(/\b(?:may\s+contain|contains?)\b\s*[:\-]?\s*/i);
    const ingredientsText = allergenSplit > 0
      ? block.slice(0, allergenSplit).replace(/[\s,;]+$/g, '').trim()
      : block;

    return {
      ingredientsText,
      allergenStatement: containsLine
        ? containsLine.replace(/^contains?\s*[:\-]?\s*/i, '').trim()
        : containsMatch?.[1]?.trim(),
      mayContainStatement: mayContainLine
        ? mayContainLine.replace(/^may\s+contain\s*[:\-]?\s*/i, '').trim()
        : mayContainMatch?.[1]?.trim(),
    };
  }

  private static classifyCategory(text: string): string {
    if (/\b(?:beverage|drink|juice|carbonated|coconut\s*water|packaged\s*water)\b/i.test(text)) {
      return 'Beverages & Soft Drinks';
    }
    if (/\b(?:biscuits?|cookies?)\b/i.test(text)) return 'Biscuits & Cookies';
    if (/\b(?:noodles?|pasta)\b/i.test(text)) return 'Instant Noodles & Pasta';
    if (/\b(?:namkeen|bhujia|sev|makhana|chips)\b/i.test(text)) return 'Traditional Indian Namkeen';
    if (/\b(?:ketchup|sauce|chutney|mayonnaise|dressing|condiment)\b/i.test(text)) return 'Sauces & Condiments';
    if (/\b(?:chocolate|cocoa|toffee|candy)\b/i.test(text)) return 'Packaged Foods';
    if (/\b(?:milk|dahi|curd|yoghurt|yogurt|paneer)\b/i.test(text)) return 'Dairy & Fresh Milk';
    return 'Packaged Foods';
  }

  private static classifyForm(
    text: string,
    unit: 'g' | 'ml' | 'l' | 'kg' | undefined,
    hasPer100Ml: boolean,
    category: string
  ): FoodForm {
    if (/\b(?:biscuit|cookie|noodle|snack|namkeen|chips|wafer|crisp|flour|bread|cake|cracker|atta|pasta|makhana|powder)\b/i.test(text)) {
      return 'SOLID';
    }
    if (hasPer100Ml || unit === 'ml' || unit === 'l') return 'LIQUID';
    if (category === 'Beverages & Soft Drinks' || category === 'Sauces & Condiments') {
      return 'LIQUID';
    }
    if (category === 'Dairy & Fresh Milk'
      && /\b(?:milk|dahi|curd|yoghurt|yogurt|lassi|buttermilk|milkshake|smoothie)\b/i.test(text)
      && !/\bpaneer\b/i.test(text)) {
      return 'LIQUID';
    }
    return 'SOLID';
  }
}
