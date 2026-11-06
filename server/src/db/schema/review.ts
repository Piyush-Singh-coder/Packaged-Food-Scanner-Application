import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { ingestionSubmissions } from './ingestion.js';

/**
 * Product Artifacts Table
 * Immutable audit storage for label photos, lab tests, and packaging artwork.
 */
export const productArtifacts = pgTable('product_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  barcodeGtin: varchar('barcode_gtin', { length: 14 }).notNull(),
  artifactType: varchar('artifact_type', { length: 50 }).notNull(), // 'LABEL_FRONT' | 'LABEL_NUTRITION' | 'LABEL_INGREDIENTS' | 'LAB_REPORT' | 'OTHER'
  storageKey: text('storage_key').notNull(),
  sha256Hash: varchar('sha256_hash', { length: 70 }).notNull(),
  mimeType: varchar('mime_type', { length: 50 }).notNull(),
  byteSize: integer('byte_size').notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Product Reviews Table
 * Formal review decisions, moderation checklists, and reviewer signatures.
 */
export const productReviews = pgTable('product_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  submissionId: uuid('submission_id').references(() => ingestionSubmissions.id, { onDelete: 'set null' }),
  barcodeGtin: varchar('barcode_gtin', { length: 14 }).notNull(),
  reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }).notNull(),
  decision: varchar('decision', { length: 30 }).notNull(), // 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'
  checklistJson: jsonb('checklist_json').default({}).notNull(),
  notes: text('notes'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ProductArtifact = typeof productArtifacts.$inferSelect;
export type NewProductArtifact = typeof productArtifacts.$inferInsert;
export type ProductReview = typeof productReviews.$inferSelect;
export type NewProductReview = typeof productReviews.$inferInsert;
