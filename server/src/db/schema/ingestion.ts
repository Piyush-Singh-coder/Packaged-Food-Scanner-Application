import { pgTable, uuid, varchar, text, timestamp, boolean, numeric, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Ingestion Submissions Table
 * Stores crowd-sourced packaging OCR scans and user contributions with moderation & audit state.
 */
export const ingestionSubmissions = pgTable('ingestion_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  barcodeGtin: varchar('barcode_gtin', { length: 14 }).notNull(),
  submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  deviceId: varchar('device_id', { length: 100 }),
  
  productName: varchar('product_name', { length: 200 }).notNull(),
  brandName: varchar('brand_name', { length: 100 }).notNull(),
  categorySlug: varchar('category_slug', { length: 100 }).notNull(),
  form: varchar('form', { length: 10 }).notNull(), // 'SOLID' | 'LIQUID'
  packageWeightG: numeric('package_weight_g', { precision: 8, scale: 2 }).notNull(),
  servingSizeG: numeric('serving_size_g', { precision: 8, scale: 2 }).notNull(),
  mrpInr: numeric('mrp_inr', { precision: 8, scale: 2 }),

  // Raw OCR & Structured Normalized Nutrition
  ocrRawText: text('ocr_raw_text'),
  nutritionJson: jsonb('nutrition_json').notNull(),
  ingredientsRawText: text('ingredients_raw_text').notNull(),

  // Plausibility & Moderation Status
  plausibilityConfidence: varchar('plausibility_confidence', { length: 20 }).notNull(), // 'HIGH' | 'SUSPECT' | 'CORRUPT'
  reviewStatus: varchar('review_status', { length: 30 }).default('PENDING_REVIEW').notNull(), // 'PENDING_REVIEW' | 'AUTO_APPROVED' | 'REJECTED'
  isPromotedToCatalog: boolean('is_promoted_to_catalog').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type IngestionSubmission = typeof ingestionSubmissions.$inferSelect;
export type NewIngestionSubmission = typeof ingestionSubmissions.$inferInsert;
