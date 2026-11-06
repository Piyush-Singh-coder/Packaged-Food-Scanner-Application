import { pgTable, uuid, varchar, text, timestamp, boolean, numeric, integer } from 'drizzle-orm/pg-core';

/**
 * Categories Master Table
 * Hierarchical food classification with statutory age boundaries and nutrient guidance ceilings.
 */
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  parentSlug: varchar('parent_slug', { length: 100 }),
  form: varchar('form', { length: 10 }).default('SOLID').notNull(), // 'SOLID' | 'LIQUID'
  infantSafe: boolean('infant_safe').default(false).notNull(),
  minAgeMonths: integer('min_age_months').default(24).notNull(),
  sugarCeilingG: numeric('sugar_ceiling_g', { precision: 6, scale: 2 }),
  sodiumCeilingMg: numeric('sodium_ceiling_mg', { precision: 8, scale: 2 }),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
