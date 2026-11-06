import { pgTable, uuid, varchar, text, timestamp, boolean, numeric, integer, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { NutritionEvidenceMap } from '../../modules/engine/types.js';

/**
 * Products Master Table
 * Relational typed per-100g columns for sub-10ms indexed sorting & swap queries.
 * Composite unique key on (barcode_gtin, formulation_version) to support brand reformulations.
 */
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  barcodeGtin: varchar('barcode_gtin', { length: 14 }).notNull(), // Normalized EAN-13 / UPC
  formulationVersion: integer('formulation_version').default(1).notNull(),
  brandName: varchar('brand_name', { length: 100 }).notNull(),
  productName: varchar('product_name', { length: 200 }).notNull(),
  categorySlug: varchar('category_slug', { length: 100 }).notNull(),
  subcategorySlug: varchar('subcategory_slug', { length: 100 }).notNull(),
  form: varchar('form', { length: 10 }).notNull(), // 'SOLID' | 'LIQUID'
  nutritionBasis: varchar('nutrition_basis', { length: 10 }).notNull().default('PER_100G'), // 'PER_100G' | 'PER_100ML'
  packageWeightG: numeric('package_weight_g', { precision: 8, scale: 2 }).notNull(),
  servingSizeG: numeric('serving_size_g', { precision: 8, scale: 2 }).notNull(),
  mrpInr: numeric('mrp_inr', { precision: 8, scale: 2 }).notNull(),

  // Typed columns for indexed nutritional math (ICMR Table 15.1 & swap sorting)
  energyKcal100g: numeric('energy_kcal_100g', { precision: 6, scale: 2 }).notNull(),
  proteinG100g: numeric('protein_g_100g', { precision: 6, scale: 2 }).notNull(),
  carbsG100g: numeric('carbs_g_100g', { precision: 6, scale: 2 }).notNull(),
  addedSugar100g: numeric('added_sugar_100g', { precision: 6, scale: 2 }),
  totalSugar100g: numeric('total_sugar_100g', { precision: 6, scale: 2 }).notNull(),
  addedFat100g: numeric('added_fat_100g', { precision: 6, scale: 2 }),
  totalFat100g: numeric('total_fat_100g', { precision: 6, scale: 2 }).notNull(),
  saturatedFat100g: numeric('saturated_fat_100g', { precision: 6, scale: 2 }).notNull(),
  transFat100g: numeric('trans_fat_100g', { precision: 6, scale: 2 }),
  cholesterolMg100g: numeric('cholesterol_mg_100g', { precision: 8, scale: 2 }),
  sodiumMg100g: numeric('sodium_mg_100g', { precision: 8, scale: 2 }).notNull(),
  saltG100g: numeric('salt_g_100g', { precision: 6, scale: 2 }).notNull(),
  dietaryFiber100g: numeric('dietary_fiber_100g', { precision: 6, scale: 2 }),

  // Orthogonal Tag Arrays
  allergenTags: text('allergen_tags').array().notNull().default(sql`'{}'::text[]`),
  highGiCarbTags: text('high_gi_carb_tags').array().notNull().default(sql`'{}'::text[]`),
  insCodes: text('ins_codes').array().notNull().default(sql`'{}'::text[]`),

  // Raw Label Content & Traceability
  ingredientsRawText: text('ingredients_raw_text').notNull(),
  dataProvenance: varchar('data_provenance', { length: 50 }).notNull(), // 'VERIFIED_PACK' | 'FOSCOS_GOV' | 'USER_CONTRIBUTED'
  nutritionEvidence: jsonb('nutrition_evidence').$type<NutritionEvidenceMap>().notNull().default({}),
  isVerified: boolean('is_verified').default(false).notNull(),
  lifecycleStatus: varchar('lifecycle_status', { length: 30 }).default('VERIFIED').notNull(), // 'DRAFT' | 'IN_REVIEW' | 'VERIFIED' | 'SUPERSEDED' | 'RETIRED'

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  barcodeFormulationIdx: uniqueIndex('barcode_formulation_idx').on(table.barcodeGtin, table.formulationVersion),
  swapLookupIdx: index('products_swap_lookup_idx').on(
    table.isVerified,
    table.nutritionBasis,
    table.categorySlug
  ),
}));

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
