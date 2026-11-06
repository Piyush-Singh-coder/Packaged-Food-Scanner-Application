import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db, isDatabaseAvailable } from '../../db/index.js';
import { products, type Product } from '../../db/schema/products.js';
import { normalizeBarcode } from '../../common/utils/barcode.js';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import { EvaluationService } from '../engine/evaluation.service.js';
import { NutrientVerifier } from '../engine/nutrient-verifier.js';
import { IngredientParser } from '../engine/ingredient-parser.js';
import { SourceBackedNutritionEngine } from '../engine/source-backed-engine.js';
import { env } from '../../config/env.js';
import { SEED_PRODUCTS, type SeedProductItem } from './seed-products.js';
import { OpenFoodFactsClient } from './open-food-facts.client.js';
import type { CreateProductInput, ProductQueryInput } from './products.schema.js';
import type {
  CompleteEvaluationOutput,
  NutritionDeclarationBasis,
  NutritionEvidenceMap,
  NutritionField,
  RawNutritionInput,
} from '../engine/types.js';

export interface EvidenceReceipt {
  verificationTimestamp?: string | null;
  dataProvenance: string;
  isVerified: boolean;
  artifactCount: number;
  sourceBreakdown?: Record<string, string>;
}

export interface ProductEvaluationResponse {
  found: true;
  barcode: string;
  product: {
    id: string;
    barcodeGtin: string;
    productName: string;
    brandName: string;
    categorySlug: string;
    subcategorySlug: string;
    form: string;
    nutritionBasis: NutritionDeclarationBasis;
    packageWeightG: number;
    servingSizeG: number;
    mrpInr: number;
    isVerified: boolean;
    dataProvenance: string;
  };
  evaluation: CompleteEvaluationOutput;
  evidenceReceipt: EvidenceReceipt;
}

function optionalNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function requiredNumber(value: string | null | undefined, field: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) throw new Error(`Stored product is missing required numeric field: ${field}`);
  return parsed;
}

/**
 * Reconstructs the source-gate input from a database row.
 *
 * The schema stores sodium and salt side by side for query convenience. A
 * companion value that was derived from the other side must not be re-read as
 * independently declared evidence, otherwise a valid sodium-only label would
 * become unverified after a database round-trip.
 */
export function storedProductToRawInput(item: Product): RawNutritionInput {
  const evidence = item.nutritionEvidence ?? {};
  const storedSodium = optionalNumber(item.sodiumMg100g);
  const storedSalt = optionalNumber(item.saltG100g);
  const hasSodiumEvidence = Boolean(evidence.sodiumMg);
  const hasSaltEvidence = Boolean(evidence.saltG);

  const saltIsDerivedFromSodium = storedSodium !== undefined
    && storedSalt !== undefined
    && Math.abs(storedSalt - Number(((storedSodium * 2.5) / 1000).toFixed(2))) <= 0.01;
  const sodiumIsDerivedFromSalt = storedSalt !== undefined
    && storedSodium !== undefined
    && Math.abs(storedSodium - Number((storedSalt * 400).toFixed(1))) <= 0.1;

  const sodiumMg = hasSaltEvidence && !hasSodiumEvidence && sodiumIsDerivedFromSalt
    ? undefined
    : storedSodium;
  const saltG = hasSodiumEvidence && !hasSaltEvidence && saltIsDerivedFromSodium
    ? undefined
    : storedSalt;

  return {
    productName: item.productName,
    brand: item.brandName,
    category: item.categorySlug,
    form: item.form as 'SOLID' | 'LIQUID',
    nutritionBasis: item.nutritionBasis === 'PER_100ML' ? 'PER_100ML' : 'PER_100G',
    servingSizeGrams: optionalNumber(item.servingSizeG),
    packageWeightGrams: optionalNumber(item.packageWeightG),
    energyKcal: requiredNumber(item.energyKcal100g, 'energyKcal100g'),
    proteinG: requiredNumber(item.proteinG100g, 'proteinG100g'),
    carbsG: requiredNumber(item.carbsG100g, 'carbsG100g'),
    totalSugarG: requiredNumber(item.totalSugar100g, 'totalSugar100g'),
    addedSugarG: optionalNumber(item.addedSugar100g),
    addedFatG: optionalNumber(item.addedFat100g),
    totalFatG: requiredNumber(item.totalFat100g, 'totalFat100g'),
    saturatedFatG: requiredNumber(item.saturatedFat100g, 'saturatedFat100g'),
    transFatG: optionalNumber(item.transFat100g),
    cholesterolMg: optionalNumber(item.cholesterolMg100g),
    sodiumMg,
    saltG,
    fiberG: optionalNumber(item.dietaryFiber100g),
    ingredientsText: item.ingredientsRawText,
    nutritionEvidence: evidence,
  };
}

function optionalString(value: number | undefined): string | null {
  return value === undefined ? null : String(value);
}

function escapeSqlWildcards(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

function isSeedCatalogVisible(): boolean {
  return env.NODE_ENV !== 'production';
}

export class ProductsService {
  // In-memory cache for offline/dev lookups. Production uses PostgreSQL only.
  private static inMemoryProducts = new Map<string, SeedProductItem>();

  static {
    for (const item of SEED_PRODUCTS) {
      const normalized = normalizeBarcode(item.barcodeGtin);
      if (normalized.isValid && normalized.normalizedGtin13) {
        ProductsService.inMemoryProducts.set(normalized.normalizedGtin13, item);
      }
    }
  }

  private dbToStoredProduct(item: Product): SeedProductItem {
    const raw = this.dbToRawInput(item);
    const report = SourceBackedNutritionEngine.inspect(raw);
    const consistency = NutrientVerifier.auditConsistency(NutrientVerifier.normalize(raw));
    return {
      ...raw,
      barcodeGtin: item.barcodeGtin,
      mrpInr: requiredNumber(item.mrpInr, 'mrpInr'),
      servingSizeGrams: requiredNumber(item.servingSizeG, 'servingSizeG'),
      packageWeightGrams: requiredNumber(item.packageWeightG, 'packageWeightG'),
      dataProvenance: item.dataProvenance,
      isVerified: item.isVerified
        && report.completeForEvaluation
        && consistency.overallConfidence !== 'CORRUPT',
    };
  }

  private dbToRawInput(item: Product): RawNutritionInput {
    return storedProductToRawInput(item);
  }

  /**
   * Retrieves a product by barcode and runs a real-time, fail-closed
   * evaluation. Demo seed data is visible only outside production and is never
   * marked verified.
   */
  public async getProductByBarcode(rawBarcode: string): Promise<ProductEvaluationResponse> {
    const validation = normalizeBarcode(rawBarcode);

    if (!validation.isValid || !validation.normalizedGtin13) {
      throw new BadRequestError(validation.error || 'Invalid barcode format or corrupted check digit');
    }

    const gtin = validation.normalizedGtin13;

    // 1. PostgreSQL first so a verified catalogue record always wins over demo data.
    let dbProduct: Product | undefined;
    if (await isDatabaseAvailable()) {
      try {
        dbProduct = await db.query.products.findFirst({
          where: eq(products.barcodeGtin, gtin),
          orderBy: [desc(products.isVerified), desc(products.formulationVersion)],
        });
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    if (dbProduct) {
      const rawInput = this.dbToRawInput(dbProduct);
      // A database row that was never verified must not become gradeable merely
      // because its stored values happen to look complete on read-back.
      const evaluationInput = dbProduct.isVerified
        ? rawInput
        : { ...rawInput, nutritionEvidence: {} };
      const evaluation = EvaluationService.evaluate(evaluationInput);
      const isVerified = dbProduct.isVerified
        && evaluation.sourceIntegrity.completeForEvaluation
        && evaluation.consistencyAudit.overallConfidence !== 'CORRUPT';
      const evidence = dbProduct.nutritionEvidence ?? {};
      const sourceBreakdown: Record<string, string> = {};
      for (const [k, v] of Object.entries(evidence)) {
        if (v && typeof v === 'object' && 'kind' in v && v.kind) {
          sourceBreakdown[k] = String(v.kind);
        }
      }

      return {
        found: true,
        barcode: gtin,
        product: {
          id: dbProduct.id,
          barcodeGtin: dbProduct.barcodeGtin,
          productName: dbProduct.productName,
          brandName: dbProduct.brandName,
          categorySlug: dbProduct.categorySlug,
          subcategorySlug: dbProduct.subcategorySlug,
          form: dbProduct.form,
          nutritionBasis: dbProduct.nutritionBasis === 'PER_100ML' ? 'PER_100ML' : 'PER_100G',
          packageWeightG: requiredNumber(dbProduct.packageWeightG, 'packageWeightG'),
          servingSizeG: requiredNumber(dbProduct.servingSizeG, 'servingSizeG'),
          mrpInr: requiredNumber(dbProduct.mrpInr, 'mrpInr'),
          isVerified,
          dataProvenance: dbProduct.dataProvenance,
        },
        evaluation,
        evidenceReceipt: {
          verificationTimestamp: dbProduct.updatedAt?.toISOString() ?? null,
          dataProvenance: dbProduct.dataProvenance,
          isVerified,
          artifactCount: Object.keys(evidence).length,
          sourceBreakdown,
        },
      };
    }

    // 2. Demo fixture fallback, development/test only.
    const memItem = isSeedCatalogVisible() ? ProductsService.inMemoryProducts.get(gtin) : undefined;
    if (memItem) {
      // Apply the same verified-row gate as database reads. A fixture or
      // in-memory record that is not verified must not become gradeable merely
      // because a caller supplied plausible-looking evidence.
      const evaluationInput = memItem.isVerified
        ? memItem
        : { ...memItem, nutritionEvidence: {} };
      const evaluation = EvaluationService.evaluate(evaluationInput);
      const isVerified = memItem.isVerified
        && evaluation.sourceIntegrity.completeForEvaluation
        && evaluation.consistencyAudit.overallConfidence !== 'CORRUPT';
      const evidence = memItem.nutritionEvidence ?? {};
      const sourceBreakdown: Record<string, string> = {};
      for (const [k, v] of Object.entries(evidence)) {
        if (v && typeof v === 'object' && 'kind' in v && v.kind) {
          sourceBreakdown[k] = String(v.kind);
        }
      }

      return {
        found: true,
        barcode: gtin,
        product: {
          id: `seed-${gtin}`,
          barcodeGtin: gtin,
          productName: memItem.productName,
          brandName: memItem.brand,
          categorySlug: memItem.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          subcategorySlug: memItem.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          form: memItem.form,
          nutritionBasis: memItem.nutritionBasis ?? 'PER_100G',
          packageWeightG: memItem.packageWeightGrams,
          servingSizeG: memItem.servingSizeGrams,
          mrpInr: memItem.mrpInr,
          isVerified,
          dataProvenance: memItem.dataProvenance,
        },
        evaluation,
        evidenceReceipt: {
          verificationTimestamp: null,
          dataProvenance: memItem.dataProvenance,
          isVerified,
          artifactCount: Object.keys(evidence).length,
          sourceBreakdown,
        },
      };
    }

    // 3. Open Food Facts external fallback (when not found in local DB or demo seeds)
    const offResult = await OpenFoodFactsClient.fetchProduct(gtin);
    if (offResult.status === 'FOUND') {
      const offItem = offResult.product;
      const evaluation = EvaluationService.evaluate(offItem);
      return {
        found: true,
        barcode: gtin,
        product: {
          id: `off-${gtin}`,
          barcodeGtin: gtin,
          productName: offItem.productName,
          brandName: offItem.brand,
          categorySlug: offItem.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          subcategorySlug: offItem.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          form: offItem.form,
          nutritionBasis: offItem.nutritionBasis ?? 'PER_100G',
          packageWeightG: offItem.packageWeightGrams ?? 100,
          servingSizeG: offItem.servingSizeGrams ?? 100,
          mrpInr: 0,
          isVerified: false,
          dataProvenance: 'OPEN_FOOD_FACTS_COMMUNITY',
        },
        evaluation,
        evidenceReceipt: {
          verificationTimestamp: null,
          dataProvenance: 'OPEN_FOOD_FACTS_COMMUNITY',
          isVerified: false,
          artifactCount: 0,
          sourceBreakdown: {},
        },
      };
    }

    const isUpstreamDown = offResult.status === 'UPSTREAM_UNAVAILABLE';
    throw new NotFoundError(
      isUpstreamDown
        ? `Product with barcode ${gtin} not found in local catalog and upstream repository is temporarily unavailable. Please capture the nutrition table and ingredient panel for instant OCR evaluation.`
        : `Product with barcode ${gtin} not found in catalog. Please capture the nutrition table and ingredient panel for instant OCR evaluation.`,
      {
        barcode: gtin,
        requiresOcrFallback: true,
        upstreamStatus: offResult.status,
      }
    );
  }

  /**
   * Searches and filters products with pagination. DB results are always
   * preferred; seed fixtures are hidden in production.
   */
  public async searchProducts(query: ProductQueryInput) {
    const { q, category, page, limit } = query;
    const offset = (page - 1) * limit;

    if (await isDatabaseAvailable()) {
      try {
        const filters = [];
        if (q) {
          const escapedQ = escapeSqlWildcards(q);
          filters.push(or(ilike(products.productName, `%${escapedQ}%`), ilike(products.brandName, `%${escapedQ}%`)));
        }
        if (category) {
          const escapedCat = escapeSqlWildcards(category);
          filters.push(ilike(products.categorySlug, `%${escapedCat}%`));
        }
        const where = filters.length > 0 ? and(...filters) : undefined;
        const [rows, [{ total }]] = await Promise.all([
          db
            .select()
            .from(products)
            .where(where)
            .orderBy(
              desc(products.isVerified),
              asc(products.productName),
              asc(products.barcodeGtin),
              desc(products.formulationVersion)
            )
            .limit(limit)
            .offset(offset),
          db.select({ total: count() }).from(products).where(where),
        ]);

        return {
          items: rows.map((item) => {
            const raw = this.dbToRawInput(item);
            const report = SourceBackedNutritionEngine.inspect(raw);
            const consistency = NutrientVerifier.auditConsistency(NutrientVerifier.normalize(raw));
            return {
              barcodeGtin: item.barcodeGtin,
              productName: item.productName,
              brandName: item.brandName,
              category: item.categorySlug,
              form: item.form,
              nutritionBasis: item.nutritionBasis,
              packageWeightG: requiredNumber(item.packageWeightG, 'packageWeightG'),
              servingSizeG: requiredNumber(item.servingSizeG, 'servingSizeG'),
              mrpInr: requiredNumber(item.mrpInr, 'mrpInr'),
              energyKcal100g: requiredNumber(item.energyKcal100g, 'energyKcal100g'),
              addedSugar100g: optionalNumber(item.addedSugar100g),
              saltG100g: optionalNumber(item.saltG100g),
              isVerified: item.isVerified
                && report.completeForEvaluation
                && consistency.overallConfidence !== 'CORRUPT',
              dataProvenance: item.dataProvenance,
            };
          }),
          pagination: {
            page,
            limit,
            total: Number(total),
            totalPages: Math.ceil(Number(total) / limit) || 1,
          },
        };
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    const inMemoryResults = isSeedCatalogVisible()
      ? Array.from(ProductsService.inMemoryProducts.values()).filter((item) => {
          if (q) {
            const searchLower = q.toLowerCase();
            if (!item.productName.toLowerCase().includes(searchLower) && !item.brand.toLowerCase().includes(searchLower)) {
              return false;
            }
          }
          if (category && !item.category.toLowerCase().includes(category.toLowerCase())) return false;
          return true;
        })
      : [];

    const total = inMemoryResults.length;
    const paginated = inMemoryResults.slice(offset, offset + limit);

    return {
      items: paginated.map((item) => ({
        barcodeGtin: item.barcodeGtin,
        productName: item.productName,
        brandName: item.brand,
        category: item.category,
        form: item.form,
        nutritionBasis: item.nutritionBasis ?? 'PER_100G',
        packageWeightG: item.packageWeightGrams,
        servingSizeG: item.servingSizeGrams,
        mrpInr: item.mrpInr,
        energyKcal100g: item.energyKcal,
        addedSugar100g: item.addedSugarG,
        saltG100g: item.saltG,
        isVerified: item.isVerified && SourceBackedNutritionEngine.inspect(item).completeForEvaluation,
        dataProvenance: item.dataProvenance,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Returns the catalogue used by the swap engine. Only source-verified rows
   * are eligible for recommendation; the caller applies that hard filter.
   */
  public async listCatalogForSwaps(): Promise<SeedProductItem[]> {
    const results = new Map<string, SeedProductItem>();

    if (await isDatabaseAvailable()) {
      try {
        const rows = await db
          .select()
          .from(products)
          .where(eq(products.isVerified, true))
          .orderBy(desc(products.formulationVersion))
          .limit(500);
        for (const row of rows) {
          results.set(row.barcodeGtin, this.dbToStoredProduct(row));
        }
      } catch (err) {
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    if (isSeedCatalogVisible()) {
      for (const item of ProductsService.inMemoryProducts.values()) {
        if (!results.has(item.barcodeGtin)) results.set(item.barcodeGtin, item);
      }
    }

    return Array.from(results.values());
  }

  /**
   * Creates or reformulates a product with mathematical plausibility gating.
   * A client or admin cannot self-declare "verified": verification is derived
   * only from a complete, permitted source-evidence map.
   */
  public async createProduct(
    input: CreateProductInput,
    options: { isTrusted?: boolean } = { isTrusted: true }
  ): Promise<{
    success: true;
    barcode: string;
    message: string;
    isVerified: boolean;
    dataProvenance: string;
  }> {
    const validation = normalizeBarcode(input.barcodeGtin);
    if (!validation.isValid || !validation.normalizedGtin13) {
      throw new BadRequestError('Invalid barcode format');
    }

    const gtin = validation.normalizedGtin13;

    if (isSeedCatalogVisible() && ProductsService.inMemoryProducts.has(gtin)) {
      throw new ConflictError(`A product with barcode ${gtin} already exists; use a formulation-version workflow for reformulations.`);
    }

    if (await isDatabaseAvailable()) {
      try {
        const existing = await db.query.products.findFirst({
          where: eq(products.barcodeGtin, gtin),
        });
        if (existing) {
          throw new ConflictError(`A product with barcode ${gtin} already exists; use a formulation-version workflow for reformulations.`);
        }
      } catch (err) {
        if (err instanceof ConflictError || env.NODE_ENV === 'production') throw err;
      }
    }

    const isTrustedCaller = options?.isTrusted ?? true;

    // Sanitize evidence: untrusted callers cannot claim VERIFIED status
    let rawEvidence = input.nutritionEvidence as NutritionEvidenceMap | undefined;
    if (!isTrustedCaller && rawEvidence) {
      const downgraded: NutritionEvidenceMap = {};
      for (const [key, ev] of Object.entries(rawEvidence)) {
        if (ev) {
          downgraded[key as NutritionField] = {
            ...ev,
            verificationStatus: 'TRANSCRIBED_UNVERIFIED',
          };
        }
      }
      rawEvidence = downgraded;
    }

    let rawInput: RawNutritionInput = {
      productName: input.productName,
      brand: input.brandName,
      category: input.categorySlug,
      form: input.form,
      nutritionBasis: input.nutritionBasis,
      nutritionContext: 'PACKAGED_PRODUCT',
      servingSizeGrams: input.servingSizeG,
      packageWeightGrams: input.packageWeightG,
      energyKcal: input.energyKcal100g,
      proteinG: input.proteinG100g,
      carbsG: input.carbsG100g,
      totalSugarG: input.totalSugarG100g,
      addedSugarG: input.addedSugarG100g,
      addedFatG: input.addedFatG100g,
      totalFatG: input.totalFatG100g,
      saturatedFatG: input.saturatedFatG100g,
      transFatG: input.transFatG100g,
      cholesterolMg: input.cholesterolMg100g,
      sodiumMg: input.sodiumMg100g,
      saltG: input.saltG100g,
      fiberG: input.dietaryFiberG100g,
      ingredientsText: input.ingredientsRawText,
      nutritionEvidence: rawEvidence,
    };

    // Persist the sodium/salt companion with explicit DERIVED evidence. This
    // keeps a database round-trip from looking as if the derived value were an
    // independently declared nutrient without provenance.
    rawInput = SourceBackedNutritionEngine.deriveSodiumFromSalt(rawInput);
    rawInput = SourceBackedNutritionEngine.deriveSaltFromSodium(rawInput);

    const normalized = NutrientVerifier.normalize(rawInput);
    const audit = NutrientVerifier.auditConsistency(normalized);
    if (audit.overallConfidence === 'CORRUPT') {
      throw new ValidationError('Product failed physical plausibility gate', {
        atwater: audit.atwaterEnergy.reason,
        mass: audit.massConservation.reason,
      });
    }

    const sourceReport = SourceBackedNutritionEngine.inspect(rawInput);
    const isVerified = isTrustedCaller && sourceReport.completeForEvaluation;
    const provenance = isVerified ? 'VERIFIED_PACK' : 'USER_CONTRIBUTED_PENDING';
    const parsedIngredients = IngredientParser.parse(input.ingredientsRawText);

    const stored: SeedProductItem = {
      ...rawInput,
      barcodeGtin: gtin,
      mrpInr: input.mrpInr,
      servingSizeGrams: input.servingSizeG,
      packageWeightGrams: input.packageWeightG,
      dataProvenance: provenance,
      isVerified,
    };

    ProductsService.inMemoryProducts.set(gtin, stored);

    if (await isDatabaseAvailable()) {
      try {
        const sodiumMg = normalized.per100g.sodiumMg;
        const saltG = normalized.per100g.saltG;
        if (sodiumMg === null || saltG === null) {
          throw new ValidationError('Product must declare sodium or salt');
        }

        await db.insert(products).values({
          barcodeGtin: gtin,
          productName: input.productName,
          brandName: input.brandName,
          categorySlug: input.categorySlug,
          subcategorySlug: input.subcategorySlug,
          form: input.form,
          nutritionBasis: input.nutritionBasis,
          packageWeightG: String(input.packageWeightG),
          servingSizeG: String(input.servingSizeG),
          mrpInr: String(input.mrpInr),
          energyKcal100g: String(input.energyKcal100g),
          proteinG100g: String(input.proteinG100g),
          carbsG100g: String(input.carbsG100g),
          addedSugar100g: optionalString(input.addedSugarG100g),
          totalSugar100g: String(input.totalSugarG100g),
          addedFat100g: optionalString(input.addedFatG100g),
          totalFat100g: String(input.totalFatG100g),
          saturatedFat100g: String(input.saturatedFatG100g),
          transFat100g: optionalString(input.transFatG100g),
          cholesterolMg100g: optionalString(input.cholesterolMg100g),
          sodiumMg100g: String(sodiumMg),
          saltG100g: String(saltG),
          dietaryFiber100g: optionalString(input.dietaryFiberG100g),
          allergenTags: parsedIngredients.allergenTagsDetected,
          highGiCarbTags: parsedIngredients.decoded
            .filter((item) => item.category === 'HIGH_GI_CARB')
            .map((item) => item.normalizedName),
          insCodes: parsedIngredients.decoded.filter((item) => item.insCode).map((item) => item.insCode!),
          ingredientsRawText: input.ingredientsRawText,
          nutritionEvidence: rawInput.nutritionEvidence ?? {},
          dataProvenance: provenance,
          isVerified,
        });
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new ConflictError(`A product with barcode ${gtin} already exists; use a formulation-version workflow for reformulations.`);
        }
        if (env.NODE_ENV === 'production') throw err;
      }
    }

    return {
      success: true,
      barcode: gtin,
      message: isVerified
        ? 'Product registered with complete source-backed evidence; a graded evaluation is available.'
        : 'Product registered for moderation. A grade is withheld until complete, verified source evidence is attached.',
      isVerified,
      dataProvenance: provenance,
    };
  }
}
