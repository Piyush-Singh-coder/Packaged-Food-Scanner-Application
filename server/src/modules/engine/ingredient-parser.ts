import type { DecodedIngredient } from './types.js';

interface AdditiveInfo {
  name: string;
  category: 'BASE_FOOD' | 'ADDED_SUGAR' | 'HIGH_GI_CARB' | 'FAT_OIL' | 'ADDITIVE';
  facts: string;
  whyFlagged?: string;
  isWarning: boolean;
  allergenTags?: string[];
}

export class IngredientParser {
  // ---------------------------------------------------------------------------
  // 1. Authoritative INS Additive & Chemical Knowledge Base
  // ---------------------------------------------------------------------------
  private static readonly INS_REGISTRY: Record<string, AdditiveInfo> = {
    '102': {
      name: 'INS 102 (Tartrazine)',
      category: 'ADDITIVE',
      facts: 'Synthetic lemon yellow azo dye used for food coloration.',
      whyFlagged: 'Synthetic azo colour; some individuals may be sensitive. This is not a diagnosis.',
      isWarning: true,
    },
    '110': {
      name: 'INS 110 (Sunset Yellow FCF)',
      category: 'ADDITIVE',
      facts: 'Synthetic orange azo dye used for food coloration.',
      whyFlagged: 'Synthetic azo colour; some individuals may be sensitive. This is not a diagnosis.',
      isWarning: true,
    },
    '150d': {
      name: 'INS 150d (Caramel IV - Sulfite Ammonia Caramel)',
      category: 'ADDITIVE',
      facts: 'Caramel color prepared by controlled heat treatment with sulfite and ammonium compounds.',
      isWarning: false,
    },
    '211': {
      name: 'INS 211 (Sodium Benzoate)',
      category: 'ADDITIVE',
      facts: 'Widely used Class II food preservative inhibiting bacterial and mold growth.',
      isWarning: false,
    },
    '220': {
      name: 'INS 220 (Sulphur Dioxide)',
      category: 'ADDITIVE',
      facts: 'Preservative and antioxidant preventing microbial spoilage.',
      whyFlagged: 'Contains sulphite; triggers asthma and allergic reactions in sensitive individuals.',
      isWarning: true,
      allergenTags: ['ALLERGEN_SULPHITE'],
    },
    '223': {
      name: 'INS 223 (Sodium Metabisulphite)',
      category: 'ADDITIVE',
      facts: 'Preservative and dough conditioner.',
      whyFlagged: 'Contains sulphite; allergen declaration depends on the applicable regulatory threshold.',
      isWarning: true,
      allergenTags: ['ALLERGEN_SULPHITE'],
    },
    '224': {
      name: 'INS 224 (Potassium Metabisulphite)',
      category: 'ADDITIVE',
      facts: 'Sulphite preservative and antioxidant used to control microbial spoilage.',
      whyFlagged: 'Contains sulphite; sensitive individuals, especially some people with asthma, may react.',
      isWarning: true,
      allergenTags: ['ALLERGEN_SULPHITE'],
    },
    '260': {
      name: 'INS 260 (Acetic Acid)',
      category: 'ADDITIVE',
      facts: 'Natural acidulant and preservative providing the characteristic acidity of vinegar.',
      isWarning: false,
    },
    '300': {
      name: 'INS 300 (Ascorbic Acid / Vitamin C)',
      category: 'ADDITIVE',
      facts: 'Essential nutrient and natural antioxidant that prevents enzymatic browning and oxidation.',
      isWarning: false,
    },
    '319': {
      name: 'INS 319 (TBHQ / Tertiary Butylhydroquinone)',
      category: 'ADDITIVE',
      facts: 'Synthetic phenolic antioxidant used to retard rancidity in vegetable fats and oils.',
      whyFlagged: 'Synthetic antioxidant; usage levels strictly regulated under FSSAI.',
      isWarning: true,
    },
    '322': {
      name: 'INS 322(i) (Lecithin)',
      category: 'ADDITIVE',
      facts: 'Natural emulsifier that may be derived from soybeans, sunflower, or rapeseed; the source must be declared separately.',
      isWarning: false,
    },
    '330': {
      name: 'INS 330 (Citric Acid)',
      category: 'ADDITIVE',
      facts: 'Natural acidulant found in citrus fruits; regulates acidity and enhances freshness.',
      isWarning: false,
    },
    '338': {
      name: 'INS 338 (Orthophosphoric Acid)',
      category: 'ADDITIVE',
      facts: 'Inorganic acidulant providing sharp acidity in cola-type beverages.',
      whyFlagged: 'Inorganic acidulant; dental and bone effects depend on the overall diet and are not established by this label alone.',
      isWarning: true,
    },
    '412': {
      name: 'INS 412 (Guar Gum)',
      category: 'ADDITIVE',
      facts: 'Natural plant fiber from guar beans used as a stabilizer and texturizer.',
      isWarning: false,
    },
    '415': {
      name: 'INS 415 (Xanthan Gum)',
      category: 'ADDITIVE',
      facts: 'Fermentation-derived polysaccharide hydrocolloid used as a stabilizer and viscosity modifier.',
      isWarning: false,
    },
    '471': {
      name: 'INS 471 (Mono- and Diglycerides of Fatty Acids)',
      category: 'ADDITIVE',
      facts: 'Food emulsifier derived from plant or animal fats used to blend oil and water phases.',
      isWarning: false,
    },
    '472e': {
      name: 'INS 472e (DATEM / Diacetyl Tartaric Acid Esters)',
      category: 'ADDITIVE',
      facts: 'Dough conditioner and strengthener used in baked goods.',
      isWarning: false,
    },
    '451(i)': {
      name: 'INS 451(i) (Pentasodium Triphosphate)',
      category: 'ADDITIVE',
      facts: 'Food-grade humectant that improves noodle dough elasticity.',
      isWarning: false,
    },
    '451': {
      name: 'INS 451 (Triphosphates)',
      category: 'ADDITIVE',
      facts: 'Food-grade humectant and texturizer.',
      isWarning: false,
    },
    '500(ii)': {
      name: 'INS 500(ii) (Sodium Bicarbonate)',
      category: 'ADDITIVE',
      facts: 'Common baking soda used as a leavening agent to release CO2 bubbles and create crispness.',
      isWarning: false,
    },
    '500(i)': {
      name: 'INS 500(i) (Sodium Carbonate)',
      category: 'ADDITIVE',
      facts: 'Food-grade leavening agent and acidity regulator.',
      isWarning: false,
    },
    '500ii': {
      name: 'INS 500(ii) (Sodium Bicarbonate)',
      category: 'ADDITIVE',
      facts: 'Common baking soda used as a leavening agent to release CO2 bubbles and create crispness.',
      isWarning: false,
    },
    '500': {
      name: 'INS 500 (Sodium Carbonates)',
      category: 'ADDITIVE',
      facts: 'Food-grade leavening agent and acidity regulator (baking soda).',
      isWarning: false,
    },
    '501(i)': {
      name: 'INS 501(i) (Potassium Carbonate)',
      category: 'ADDITIVE',
      facts: 'Acidity regulator providing traditional alkaline dough firmness for noodles.',
      isWarning: false,
    },
    '501': {
      name: 'INS 501 (Potassium Carbonate)',
      category: 'ADDITIVE',
      facts: 'Acidity regulator for dough elasticity.',
      isWarning: false,
    },
    '503(ii)': {
      name: 'INS 503(ii) (Ammonium Bicarbonate)',
      category: 'ADDITIVE',
      facts: 'Traditional biscuit leavening agent that completely evaporates as harmless gas during baking.',
      isWarning: false,
    },
    '503ii': {
      name: 'INS 503(ii) (Ammonium Bicarbonate)',
      category: 'ADDITIVE',
      facts: 'Traditional biscuit leavening agent that completely evaporates as harmless gas during baking.',
      isWarning: false,
    },
    '503': {
      name: 'INS 503 (Ammonium Carbonates)',
      category: 'ADDITIVE',
      facts: 'Traditional biscuit leavening agent that completely evaporates during baking.',
      isWarning: false,
    },
    '508': {
      name: 'INS 508 (Potassium Chloride)',
      category: 'ADDITIVE',
      facts: 'Mineral salt substitute often used to reduce sodium content.',
      whyFlagged: 'Potassium salt; people with kidney disease should check with a clinician rather than relying on a label verdict.',
      isWarning: true,
    },
    '621': {
      name: 'INS 621 (Monosodium Glutamate / MSG)',
      category: 'ADDITIVE',
      facts: 'Flavor enhancer providing savory umami taste.',
      isWarning: false,
    },
    '635': {
      name: 'INS 635 (Disodium 5-ribonucleotides)',
      category: 'ADDITIVE',
      facts: 'Synergistic savory flavor enhancer.',
      isWarning: false,
    },
    '950': {
      name: 'INS 950 (Acesulfame Potassium)',
      category: 'ADDITIVE',
      facts: 'High-intensity non-sugar sweetener.',
      whyFlagged: 'WHO 2023 makes a conditional recommendation against non-sugar sweeteners for long-term weight control. This is not a pediatric ban.',
      isWarning: true,
    },
    '951': {
      name: 'INS 951 (Aspartame)',
      category: 'ADDITIVE',
      facts: 'High-intensity artificial sweetener.',
      whyFlagged: 'Contains phenylalanine and is contraindicated in phenylketonuria. No pediatric ban is asserted.',
      isWarning: true,
    },
    '954': {
      name: 'INS 954 (Saccharin)',
      category: 'ADDITIVE',
      facts: 'High-intensity non-sugar sweetener.',
      whyFlagged: 'Non-sugar sweetener; relevant to the child advisory lens.',
      isWarning: true,
    },
    '955': {
      name: 'INS 955 (Sucralose)',
      category: 'ADDITIVE',
      facts: 'High-intensity non-nutritive sweetener derived from sucrose.',
      whyFlagged: 'WHO 2023 conditional advisory on non-sugar sweeteners for long-term weight control; not a pediatric ban.',
      isWarning: true,
    },
    '960': {
      name: 'INS 960 (Steviol Glycosides)',
      category: 'ADDITIVE',
      facts: 'High-intensity sweetener derived from the stevia plant.',
      whyFlagged: 'Non-sugar sweetener; relevant to the child advisory lens.',
      isWarning: true,
    },
    '961': {
      name: 'INS 961 (Neotame)',
      category: 'ADDITIVE',
      facts: 'High-intensity non-sugar sweetener.',
      whyFlagged: 'Non-sugar sweetener; relevant to the child advisory lens.',
      isWarning: true,
    },
    '962': {
      name: 'INS 962 (Aspartame-Acesulfame Salt)',
      category: 'ADDITIVE',
      facts: 'High-intensity non-sugar sweetener containing aspartame and acesulfame.',
      whyFlagged: 'Non-sugar sweetener; contains phenylalanine and is relevant to the child advisory lens.',
      isWarning: true,
    },
    '969': {
      name: 'INS 969 (Advantame)',
      category: 'ADDITIVE',
      facts: 'High-intensity non-sugar sweetener.',
      whyFlagged: 'Non-sugar sweetener; relevant to the child advisory lens.',
      isWarning: true,
    },
    '1422': {
      name: 'INS 1422 (Acetylated Distarch Adipate)',
      category: 'ADDITIVE',
      facts: 'Chemically modified starch thickener resistant to acid and temperature fluctuations.',
      isWarning: false,
    },
  };

  // ---------------------------------------------------------------------------
  // 2. High-Glycemic Carbohydrates (Separated strictly from Added Sugar)
  // ---------------------------------------------------------------------------
  private static readonly HIGH_GI_CARB_MARKERS: Record<string, string> = {
    'maltodextrin': 'Refined starch hydrolysate; rapidly digested and often used without being declared as sugar.',
    'liquid glucose': 'Hydrolysed starch syrup containing fast-absorbing glucose and maltose.',
    'corn syrup solids': 'Dehydrated corn syrup; a refined, rapidly digested carbohydrate source.',
    'modified starch': 'Chemically altered starch used for thickening; its glycemic effect depends on the food matrix and portion.',
    'dextrin': 'Short-chain starch hydrolysate used as a refined carbohydrate.',
    'glucose syrup': 'Refined glucose syrup used as a sweetener.',
    'corn syrup': 'Refined glucose-containing syrup.',
    'rice syrup': 'Refined syrup containing rice-derived sugars.',
    'refined flour': 'Refined cereal flour with less fibre than whole grain; not a measured glycemic index.',
    'refined wheat flour': 'Refined wheat flour (maida); a refined carbohydrate, not a measured glycemic index.',
    'maida': 'Refined wheat flour; a refined carbohydrate, not a measured glycemic index.',
    'white flour': 'Refined cereal flour; a refined carbohydrate, not a measured glycemic index.',
  };

  // ---------------------------------------------------------------------------
  // 3. Added Sugars Dictionary
  // ---------------------------------------------------------------------------
  private static readonly ADDED_SUGAR_MARKERS: Record<string, string> = {
    'sugar': 'Refined cane sucrose.',
    'invert sugar syrup': 'Sucrose split into glucose and fructose to maintain moisture and sweetness.',
    'invert sugar': 'Sucrose split into glucose and fructose.',
    'high fructose corn syrup': 'Processed sweetener high in unbound fructose.',
    'dextrose': 'Simple D-glucose, rapidly absorbed into bloodstream.',
    'jaggery': 'Traditional unrefined cane sugar containing sucrose.',
    'honey': 'Natural sweetener containing free fructose and glucose.',
    'fructose': 'Monosaccharide free sugar.',
    'brown sugar': 'Refined sucrose with molasses.',
  };

  // ---------------------------------------------------------------------------
  // 4. Fats & Oils
  // ---------------------------------------------------------------------------
  private static readonly FAT_OIL_MARKERS: Record<string, { facts: string; warning?: string }> = {
    'palmolein': {
      facts: 'Refined fraction of palm oil.',
      warning: 'Refined palm fraction; use the declared saturated-fat value rather than an ingredient-level claim.',
    },
    'palm oil': {
      facts: 'Tropical plant oil.',
      warning: 'Tropical plant oil; use the declared saturated-fat value rather than an ingredient-level claim.',
    },
    'hydrogenated vegetable oil': {
      facts: 'Vegetable oil subjected to chemical hydrogenation.',
      warning: 'Hydrogenated fat source; potential carrier of industrial trans fatty acids.',
    },
    'vanaspati': {
      facts: 'Hydrogenated vegetable fat traditionally used in Indian cooking.',
      warning: 'Hydrogenated fat source; strictly regulated under FSSAI trans-fat standards.',
    },
    'butter': {
      facts: 'Dairy fat.',
    },
    'ghee': {
      facts: 'Clarified dairy butterfat.',
    },
    'sunflower oil': {
      facts: 'Vegetable oil.',
    },
  };

  /**
   * FSSAI's eight statutory allergen groups are the only tags returned here.
   * Sesame, mustard, and lactose are tracked as advisory tags because they are
   * not in the eight statutory groups; lecithin is not assumed to be soy.
   */
  private static allergenTagsForToken(lower: string): string[] {
    if (this.isFreeFromClaim(lower)) return [];

    const tags: string[] = [];
    if (/wheat|maida|atta|barley|rye|spelt|triticale/i.test(lower)) tags.push('ALLERGEN_GLUTEN');
    if (/milk|dairy|whey|casein|butter|ghee|curd|paneer|cream|cheese|yoghurt|yogurt|milk\s*(?:solid|powder)/i.test(lower)) {
      tags.push('ALLERGEN_MILK');
    }
    if (/prawn|crab|shrimp|crustacean|langoustine/i.test(lower)) tags.push('ALLERGEN_CRUSTACEAN');
    if (/\bfish\b|anchovy|tuna|salmon|marine\s+gelatin/i.test(lower)) tags.push('ALLERGEN_FISH');
    if (/peanut|groundnut|moongphali|arachis/i.test(lower)) tags.push('ALLERGEN_PEANUT');
    if (/almond|cashew|pistachio|walnut|hazelnut|pecan|macadamia|tree\s*nut/i.test(lower)) tags.push('ALLERGEN_TREE_NUT');
    if (/soy|soya/i.test(lower)) tags.push('ALLERGEN_SOY');
    if (/\begg\b|\beggs\b|albumin|ovalbumin/i.test(lower) && !/eggless/i.test(lower)) tags.push('ALLERGEN_EGG');
    if (/sulphite|sulfite|sulphur\s*dioxide|sulfur\s*dioxide|metabisulphite|metabisulfite/i.test(lower)) {
      tags.push('ALLERGEN_SULPHITE');
    }
    return Array.from(new Set(tags));
  }

  private static advisoryTagsForToken(lower: string): string[] {
    if (this.isFreeFromClaim(lower)) return [];
    const tags: string[] = [];
    if (/sesame|til\b/i.test(lower)) tags.push('ADVISORY_SESAME');
    if (/mustard|\brai\b/i.test(lower)) tags.push('ADVISORY_MUSTARD');
    if (/lactose/i.test(lower)) tags.push('ADVISORY_LACTOSE');
    return Array.from(new Set(tags));
  }

  private static isFreeFromClaim(lower: string): boolean {
    return /\b(?:gluten|wheat|milk|dairy|soy|soya|egg|nut|peanut|sesame|mustard)[-\s]*free\b|\bfree\s+from\s+(?:gluten|wheat|milk|dairy|soy|soya|egg|nuts?|peanut|sesame|mustard)\b|\beggless\b/i.test(lower);
  }

  private static freeFromClaimsIn(text: string): string[] {
    const claims = new Set<string>();
    const patterns: Array<[RegExp, string]> = [
      [/\bgluten[-\s]*free\b/gi, 'GLUTEN_FREE'],
      [/\bwheat[-\s]*free\b/gi, 'WHEAT_FREE'],
      [/\bmilk[-\s]*free\b/gi, 'MILK_FREE'],
      [/\bdairy[-\s]*free\b/gi, 'DAIRY_FREE'],
      [/\bsoy[-\s]*free\b/gi, 'SOY_FREE'],
      [/\bsoya[-\s]*free\b/gi, 'SOY_FREE'],
      [/\beggless\b/gi, 'EGGLESS'],
      [/\bnut[-\s]*free\b/gi, 'NUT_FREE'],
      [/\bpeanut[-\s]*free\b/gi, 'PEANUT_FREE'],
    ];
    for (const [pattern, label] of patterns) {
      if (pattern.test(text)) claims.add(label);
    }
    return Array.from(claims);
  }

  /**
   * Recursively decomposes an Indian ingredient text string into atomic tokens.
   * Handles nested parentheses, brackets, percentages, and commas.
   */
  public static tokenize(rawText: string): string[] {
    if (!rawText || typeof rawText !== 'string') return [];

    const splitTopLevel = (text: string): string[] => {
      const result: string[] = [];
      let current = '';
      let depth = 0;

      for (const char of text) {
        if (char === '(' || char === '[') depth++;
        if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
        if ((char === ',' || char === ';') && depth === 0) {
          if (current.trim()) result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (current.trim()) result.push(current.trim());
      return result;
    };

    const flatten = (segment: string): string[] => {
      // Parentheses in an INS code are part of the code, not a nested
      // ingredient list: INS 500(i), INS 503(ii), etc.
      if (/^\s*(?:(?:ins|e)\s*)?\d{3,4}\s*\([a-z]+\)\s*$/i.test(segment)) {
        return [segment.trim()];
      }
      const openIndex = segment.search(/[\[\(]/);
      if (openIndex < 0) return [segment.trim()].filter(Boolean);

      const open = segment[openIndex];
      const close = open === '(' ? ')' : ']';
      let depth = 0;
      let closeIndex = -1;
      for (let i = openIndex; i < segment.length; i++) {
        if (segment[i] === open) depth++;
        if (segment[i] === close) {
          depth--;
          if (depth === 0) {
            closeIndex = i;
            break;
          }
        }
      }

      if (closeIndex < 0) return [segment.trim()].filter(Boolean);

      const parent = segment.slice(0, openIndex).trim();
      const inner = segment.slice(openIndex + 1, closeIndex);
      const suffix = segment.slice(closeIndex + 1).trim();
      return [
        ...(parent ? [parent] : []),
        ...splitTopLevel(inner).flatMap(flatten),
        ...(suffix ? flatten(suffix) : []),
      ];
    };

    return splitTopLevel(rawText)
      .flatMap(flatten)
      .filter((token) => !/^\d+(?:\.\d+)?%$/.test(token.trim()));
  }

  /**
   * Decodes and classifies all tokens against the authoritative knowledge base.
   * Guarantees 100% token accounting: unclassified items are captured and flagged.
   */
  public static parse(ingredientsText?: string): {
    totalTokens: number;
    classifiedCount: number;
    coveragePercent: number;
    decoded: DecodedIngredient[];
    unclassifiedTokens: string[];
    allergenTagsDetected: string[];
    statutoryAllergenTags: string[];
    advisoryTags: string[];
    mayContainAllergenTags: string[];
    freeFromClaims: string[];
  } {
    if (!ingredientsText) {
      return {
        totalTokens: 0,
        classifiedCount: 0,
        coveragePercent: 100,
        decoded: [],
        unclassifiedTokens: [],
        allergenTagsDetected: [],
        statutoryAllergenTags: [],
        advisoryTags: [],
        mayContainAllergenTags: [],
        freeFromClaims: [],
      };
    }

    const mayContainMatch = ingredientsText.match(/\bmay\s+contain\b\s*[:\-]?\s*([\s\S]*)$/i);
    const mayContainText = mayContainMatch?.[1]?.trim() ?? '';
    const mainIngredientsText = mayContainMatch && mayContainMatch.index !== undefined
      ? ingredientsText.slice(0, mayContainMatch.index)
      : ingredientsText;

    const freeFromClaims = this.freeFromClaimsIn(mainIngredientsText);
    const mayContainTags = new Set<string>();
    if (mayContainText) {
      for (const token of this.tokenize(mayContainText)) {
        const lower = token.toLowerCase();
        this.allergenTagsForToken(lower).forEach((tag) => mayContainTags.add(tag));
        this.advisoryTagsForToken(lower).forEach((tag) => mayContainTags.add(tag));
      }
    }

    const rawTokens = this.tokenize(mainIngredientsText);
    const decoded: DecodedIngredient[] = [];
    const unclassifiedTokens: string[] = [];
    const allergenSet = new Set<string>();
    const advisorySet = new Set<string>();

    for (const token of rawTokens) {
      // Strip percentage annotations like "(48%)" or "1.8%"
      const cleanToken = token.replace(/\b\d+(\.\d+)?%\b/g, '').replace(/[()\[\]]/g, '').trim();
      const lower = cleanToken.toLowerCase();

      if (!lower) continue;

      const tokenFreeFrom = this.isFreeFromClaim(lower);
      const tokenAdvisoryTags = this.advisoryTagsForToken(lower);
      let matched = false;

      if (tokenFreeFrom) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'FREE_FROM',
          facts: 'Pack carries a free-from claim. It is tracked as a claim, not as proof that the food is allergen-safe.',
          isWarning: false,
        });
        matched = true;
        continue;
      }

      // 1. Check INS Additive Database
      // An INS additive code is matched either if it has an explicit "INS" or "E" prefix,
      // or if the entire token is an isolated code (e.g. "500(i)", "503(ii)", "322").
      // Arbitrary numbers inside ingredient names (e.g. "Flour 500g") must NOT match.
      const rawLower = token.toLowerCase();
      const explicitInsMatch = /vitamin\s*e/i.test(rawLower)
        ? null
        : rawLower.match(/\b(?:ins|e)\s*([0-9]{3,4})(?:\s*\(\s*([a-z]+)\s*\)|\s*([a-z]+))?/i);
      const standaloneCodeMatch = !explicitInsMatch && /^\s*([0-9]{3,4})(?:\s*\(\s*([a-z]+)\s*\)|\s*([a-z]+))?\s*$/i.test(rawLower)
        ? rawLower.match(/^\s*([0-9]{3,4})(?:\s*\(\s*([a-z]+)\s*\)|\s*([a-z]+))?\s*$/i)
        : null;
      const insMatch = explicitInsMatch || standaloneCodeMatch;

      if (insMatch) {
        const suffix = (insMatch[2] || insMatch[3])?.toLowerCase();
        const parenthesisedSuffix = Boolean(suffix && /\(\s*[a-z]+\s*\)/i.test(insMatch[0]));
        const code = `${insMatch[1]}${suffix ? (parenthesisedSuffix ? `(${suffix})` : suffix) : ''}`.toLowerCase();
        const sulphiteCode = Number(insMatch[1]);
        const info = this.INS_REGISTRY[code]
          || this.INS_REGISTRY[`${insMatch[1]}${suffix ?? ''}`.toLowerCase()]
          || (sulphiteCode >= 220 && sulphiteCode <= 228
            ? {
                name: `INS ${sulphiteCode} (Sulphite preservative)`,
                category: 'ADDITIVE' as const,
                facts: 'Sulphite preservative used to reduce oxidation and microbial spoilage.',
                whyFlagged: 'Contains sulphite; sensitive individuals may react.',
                isWarning: true,
                allergenTags: ['ALLERGEN_SULPHITE'],
              }
            : undefined);
        if (info) {
          const allergenTags = info.allergenTags || [];
          decoded.push({
            rawToken: token,
            normalizedName: info.name,
            category: info.category,
            insCode: code,
            allergenTags,
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: allergenTags.length > 0 ? 'CONTAINS' : 'NONE',
            facts: info.facts,
            whyFlagged: info.whyFlagged,
            isWarning: info.isWarning,
          });
          if (info.allergenTags) info.allergenTags.forEach((t) => allergenSet.add(t));
          tokenAdvisoryTags.forEach((t) => advisorySet.add(t));
          matched = true;
          continue;
        }
      }

      // 2. Check High-Glycemic Carbohydrates
      for (const [marker, fact] of Object.entries(this.HIGH_GI_CARB_MARKERS)) {
        if (lower.includes(marker)) {
          const allergenTags = this.allergenTagsForToken(lower);
          decoded.push({
            rawToken: token,
            normalizedName: marker.toUpperCase(),
            category: 'HIGH_GI_CARB',
            allergenTags,
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: allergenTags.length > 0 ? 'CONTAINS' : 'NONE',
            facts: fact,
            whyFlagged: 'Refined carbohydrate source; interpret alongside total carbohydrate, fibre, and portion size. This is not a measured glycemic index.',
            isWarning: true,
          });
          allergenTags.forEach((tag) => allergenSet.add(tag));
          tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 3. Check Added Sugars
      for (const [marker, fact] of Object.entries(this.ADDED_SUGAR_MARKERS)) {
        if (lower.includes(marker)) {
          decoded.push({
            rawToken: token,
            normalizedName: marker.toUpperCase(),
            category: 'ADDED_SUGAR',
            allergenTags: [],
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: 'NONE',
            facts: fact,
            whyFlagged: 'Contributes to added free sugar intake.',
            isWarning: true,
          });
          tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 4. Check Fats & Oils
      for (const [marker, val] of Object.entries(this.FAT_OIL_MARKERS)) {
        if (lower.includes(marker)) {
          const allergenTags = lower.includes('butter') || lower.includes('ghee') ? ['ALLERGEN_MILK'] : [];
          decoded.push({
            rawToken: token,
            normalizedName: marker.toUpperCase(),
            category: 'FAT_OIL',
            allergenTags,
            advisoryTags: tokenAdvisoryTags,
            allergenStatus: allergenTags.length > 0 ? 'CONTAINS' : 'NONE',
            facts: val.facts,
            whyFlagged: val.warning,
            isWarning: !!val.warning,
          });
          if (lower.includes('butter') || lower.includes('ghee')) allergenSet.add('ALLERGEN_MILK');
          tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Common functional classes are useful classifications even when the
      // pack omits the numeric INS code. Unknown chemical names still fall
      // through to the explicit UNCLASSIFIED safety net below.
      if (/raising\s+agent|emulsifier|thickener|stabilizer|acidity\s+regulator|preservative|flavou?ring|colour|color|vitamin|mineral/i.test(lower)) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'ADDITIVE',
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'NONE',
          facts: 'Declared functional ingredient class; exact substance should be checked against its INS code where present.',
          isWarning: false,
        });
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
        matched = true;
        continue;
      }

      // 5. Check Allergens & Base Grains
      const allergenTags = this.allergenTagsForToken(lower);
      const allergenMatch: { tag: string; facts: string } | undefined = allergenTags[0]
        ? { tag: allergenTags[0], facts: 'Ingredient associated with a registered allergen category.' }
        : undefined;

      if (allergenMatch) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags,
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'CONTAINS',
          facts: allergenMatch.facts,
          isWarning: false,
        });
        allergenTags.forEach((tag) => allergenSet.add(tag));
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
        matched = true;
      } else if (lower.includes('wheat') || lower.includes('maida') || lower.includes('atta') || lower.includes('barley')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: ['ALLERGEN_GLUTEN'],
          facts: 'Cereal grain containing gluten protein.',
          isWarning: false,
        });
        allergenSet.add('ALLERGEN_GLUTEN');
        matched = true;
      } else if (lower.includes('milk') || lower.includes('whey') || lower.includes('casein')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: ['ALLERGEN_MILK'],
          facts: 'Dairy derivative containing milk solids and lactose.',
          isWarning: false,
        });
        allergenSet.add('ALLERGEN_MILK');
        matched = true;
      } else if (lower.includes('lactose')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          advisoryTags: ['ADVISORY_LACTOSE'],
          allergenStatus: 'NONE',
          facts: 'Milk sugar; relevant to lactose intolerance rather than milk-protein allergy.',
          isWarning: false,
        });
        advisorySet.add('ADVISORY_LACTOSE');
        matched = true;
      } else if (lower.includes('cocoa') || lower.includes('chocolate')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Solids derived from cacao beans.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('salt') || lower.includes('iodised salt')) {
        const isIodised = /\biodi[sz]ed\b/.test(lower);
        decoded.push({
          rawToken: token,
          normalizedName: isIodised ? 'Iodised Salt' : cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'NONE',
          facts: isIodised
            ? 'Sodium chloride supplemented with iodine.'
            : 'Sodium chloride; iodine status is not stated on this ingredient token.',
          isWarning: false,
        });
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
        matched = true;
      } else if (
        lower.includes('spice') ||
        lower.includes('masala') ||
        lower.includes('chilli') ||
        lower.includes('turmeric') ||
        lower.includes('coriander') ||
        lower.includes('cumin') ||
        lower.includes('garlic') ||
        lower.includes('ginger') ||
        lower.includes('onion') ||
        lower.includes('pepper') ||
        lower.includes('clove') ||
        lower.includes('cardamom') ||
        lower.includes('fenugreek') ||
        lower.includes('aniseed') ||
        lower.includes('nutmeg') ||
        lower.includes('tomato')
      ) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Natural spice, culinary herb or vegetable seasoning.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('starch') || lower.includes('water')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Culinary staple base component.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('caffeine')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Caffeine',
          category: 'ADDITIVE',
          allergenTags: [],
          facts: 'Caffeine is a stimulant; intake advice depends on age, pregnancy, and medical conditions.',
          whyFlagged: 'Caffeine-containing ingredient; evaluate the declared amount and individual circumstances rather than treating this as a diagnosis.',
          isWarning: true,
        });
        matched = true;
      } else if (lower.includes('wheat bran')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Wheat Bran',
          category: 'BASE_FOOD',
          allergenTags: ['ALLERGEN_GLUTEN'],
          facts: 'Outer layer of the wheat grain; fibre content must come from the nutrition panel.',
          isWarning: false,
        });
        allergenSet.add('ALLERGEN_GLUTEN');
        matched = true;
      } else if (lower.includes('oat')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Whole-grain oat cereal; fibre content varies by product and must come from the nutrition panel.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('moth bean') || lower.includes('moth flour') || lower.includes('gram flour') || lower.includes('besan') || lower.includes('chana')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Traditional Indian pulse staple; composition varies by product and preparation.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('makhana') || lower.includes('fox nut') || lower.includes('gorgon nut')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Roasted Makhana',
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Popped water lily seeds; composition varies by product and preparation.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('coconut water')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Tender Coconut Water',
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Liquid endosperm of green coconuts; composition varies by product.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('vinegar')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Fermented culinary condiment providing mild acetic acidity.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('cranberr')) {
        decoded.push({
          rawToken: token,
          normalizedName: 'Cranberries',
          category: 'BASE_FOOD',
          allergenTags: [],
          facts: 'Dried fruit; check the nutrition panel for added sugar and declared nutrients.',
          isWarning: false,
        });
        matched = true;
      } else if (lower.includes('cottonseed') || lower.includes('olive oil') || lower.includes('coconut oil')) {
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'FAT_OIL',
          allergenTags: [],
          facts: 'Culinary plant oil used for cooking and texture.',
          isWarning: false,
        });
        matched = true;
      }

      // 6. Safety Net: If unclassified, capture explicitly
      if (!matched) {
        unclassifiedTokens.push(token);
        decoded.push({
          rawToken: token,
          normalizedName: cleanToken,
          category: 'UNCLASSIFIED',
          allergenTags: [],
          advisoryTags: tokenAdvisoryTags,
          allergenStatus: 'NONE',
          facts: 'Unclassified ingredient awaiting verification review.',
          isWarning: false,
        });
        tokenAdvisoryTags.forEach((tag) => advisorySet.add(tag));
      }
    }

    const totalTokens = rawTokens.length;
    const classifiedCount = totalTokens - unclassifiedTokens.length;
    const coveragePercent = totalTokens > 0
      ? Number(((classifiedCount / totalTokens) * 100).toFixed(1))
      : 100;

    return {
      totalTokens,
      classifiedCount,
      coveragePercent,
      decoded,
      unclassifiedTokens,
      allergenTagsDetected: Array.from(allergenSet),
      statutoryAllergenTags: Array.from(allergenSet),
      advisoryTags: Array.from(advisorySet),
      mayContainAllergenTags: Array.from(mayContainTags),
      freeFromClaims,
    };
  }
}
