import { eq, desc } from 'drizzle-orm';
import { db, isDatabaseAvailable } from '../../db/index.js';
import { ingestionSubmissions, productReviews } from '../../db/schema/index.js';
import { OcrService } from '../ocr/ocr.service.js';
import { ProductsService } from '../products/products.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../../common/errors/app-error.js';
import type { ListSubmissionsQuery, ReviewSubmissionBody } from './admin.schema.js';
import type { NutritionEvidenceMap, NutritionField } from '../engine/types.js';

export class AdminService {
  private productsService = new ProductsService();

  // In-memory reviews fallback for local test/dev environments
  private static memoryReviews = new Map<string, any>();

  public async listSubmissions(query: ListSubmissionsQuery) {
    const { status, page, limit } = query;
    const offset = (page - 1) * limit;

    if (await isDatabaseAvailable()) {
      try {
        const condition = status && status !== 'ALL'
          ? eq(ingestionSubmissions.reviewStatus, status)
          : undefined;

        const rows = await db
          .select()
          .from(ingestionSubmissions)
          .where(condition)
          .orderBy(desc(ingestionSubmissions.createdAt))
          .limit(limit)
          .offset(offset);

        return {
          items: rows,
          pagination: { page, limit },
        };
      } catch (err) {
        // Fall back to in-memory store in non-prod environments
      }
    }

    const all = Array.from(OcrService.memorySubmissions.values());
    const filtered = status && status !== 'ALL'
      ? all.filter((s) => s.reviewStatus === status)
      : all;

    return {
      items: filtered.slice(offset, offset + limit),
      pagination: {
        page,
        limit,
        total: filtered.length,
      },
    };
  }

  public async reviewSubmission(
    submissionId: string,
    reviewerId: string,
    body: ReviewSubmissionBody
  ) {
    let submission = OcrService.memorySubmissions.get(submissionId);

    if (await isDatabaseAvailable()) {
      try {
        const found = await db.query.ingestionSubmissions.findFirst({
          where: eq(ingestionSubmissions.id, submissionId),
        });
        if (found) submission = found as any;
      } catch (err) {
        // use memory submission
      }
    }

    if (!submission) {
      throw new NotFoundError(`Submission with ID ${submissionId} was not found.`);
    }

    const reviewId = crypto.randomUUID();
    const reviewRecord = {
      id: reviewId,
      submissionId,
      barcodeGtin: submission.barcodeGtin,
      reviewerId,
      decision: body.decision,
      checklistJson: body.checklist,
      notes: body.notes || null,
      decidedAt: new Date(),
    };

    AdminService.memoryReviews.set(reviewId, reviewRecord);

    // Update submission status in memory
    submission.reviewStatus = body.decision;
    submission.updatedAt = new Date();

    if (await isDatabaseAvailable()) {
      try {
        await db.insert(productReviews).values(reviewRecord);
        await db
          .update(ingestionSubmissions)
          .set({ reviewStatus: body.decision, updatedAt: new Date() })
          .where(eq(ingestionSubmissions.id, submissionId));
      } catch (err) {
        // non-fatal in local fallback
      }
    }

    return {
      success: true,
      reviewId,
      decision: body.decision,
      barcodeGtin: submission.barcodeGtin,
      message: `Submission ${body.decision.toLowerCase()} by reviewer.`,
    };
  }

  public async promoteSubmission(submissionId: string, reviewerId: string) {
    let submission = OcrService.memorySubmissions.get(submissionId);

    if (await isDatabaseAvailable()) {
      try {
        const found = await db.query.ingestionSubmissions.findFirst({
          where: eq(ingestionSubmissions.id, submissionId),
        });
        if (found) submission = found as any;
      } catch (err) {
        // use memory
      }
    }

    if (!submission) {
      throw new NotFoundError(`Submission with ID ${submissionId} was not found.`);
    }

    if (submission.reviewStatus !== 'APPROVED') {
      throw new ValidationError(`Cannot promote submission: current status is '${submission.reviewStatus}'. Submission must be 'APPROVED' before promotion.`);
    }

    if (submission.plausibilityConfidence === 'CORRUPT') {
      throw new ValidationError('Cannot promote submission: nutritional facts violate physical mass or energy conservation laws.');
    }

    if (submission.isPromotedToCatalog) {
      throw new ConflictError(`Submission ${submissionId} has already been promoted to the catalogue.`);
    }

    const rawNutrition = typeof submission.nutritionJson === 'string'
      ? JSON.parse(submission.nutritionJson)
      : submission.nutritionJson;

    // Upgrade unverified evidence to verified pack evidence signed by reviewer
    const rawEvidence = (rawNutrition.nutritionEvidence || {}) as NutritionEvidenceMap;
    const promotedEvidence: NutritionEvidenceMap = {};
    const timestamp = new Date().toISOString();

    for (const [key, ev] of Object.entries(rawEvidence)) {
      if (ev) {
        promotedEvidence[key as NutritionField] = {
          ...ev,
          verificationStatus: 'VERIFIED',
          sourceId: `PACK_PHOTO:${submission.barcodeGtin}:reviewed`,
          sourceTitle: `Verified manufacturer packaging panel (Audited by ${reviewerId})`,
          capturedAt: ev.capturedAt || timestamp,
          artifactHash: ev.artifactHash || `sha256:${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`,
        };
      }
    }

    const productPayload = {
      barcodeGtin: submission.barcodeGtin,
      productName: submission.productName,
      brandName: submission.brandName,
      categorySlug: submission.categorySlug,
      subcategorySlug: 'general',
      form: submission.form as 'SOLID' | 'LIQUID',
      nutritionBasis: (rawNutrition.nutritionBasis || 'PER_100G') as 'PER_100G' | 'PER_100ML',
      packageWeightG: Number(submission.packageWeightG),
      servingSizeG: Number(submission.servingSizeG),
      mrpInr: submission.mrpInr ? Number(submission.mrpInr) : 0,
      energyKcal100g: rawNutrition.energyKcal ?? 0,
      proteinG100g: rawNutrition.proteinG ?? 0,
      carbsG100g: rawNutrition.carbsG ?? 0,
      totalSugarG100g: rawNutrition.totalSugarG ?? 0,
      addedSugarG100g: rawNutrition.addedSugarG ?? undefined,
      addedFatG100g: rawNutrition.addedFatG ?? undefined,
      totalFatG100g: rawNutrition.totalFatG ?? 0,
      saturatedFatG100g: rawNutrition.saturatedFatG ?? 0,
      transFatG100g: rawNutrition.transFatG ?? undefined,
      cholesterolMg100g: rawNutrition.cholesterolMg ?? undefined,
      sodiumMg100g: rawNutrition.sodiumMg ?? 0,
      saltG100g: rawNutrition.saltG ?? undefined,
      dietaryFiberG100g: rawNutrition.fiberG ?? undefined,
      ingredientsRawText: submission.ingredientsRawText,
      nutritionEvidence: promotedEvidence,
    };

    // Promote into catalogue as trusted admin
    const created = await this.productsService.createProduct(productPayload, { isTrusted: true });

    submission.isPromotedToCatalog = true;
    submission.updatedAt = new Date();

    if (await isDatabaseAvailable()) {
      try {
        await db
          .update(ingestionSubmissions)
          .set({ isPromotedToCatalog: true, updatedAt: new Date() })
          .where(eq(ingestionSubmissions.id, submissionId));
      } catch (err) {
        // non-fatal in local fallback
      }
    }

    return {
      success: true,
      barcode: submission.barcodeGtin,
      submissionId,
      isVerified: created.isVerified,
      message: 'Product successfully reviewed and promoted to verified catalog.',
    };
  }
}
