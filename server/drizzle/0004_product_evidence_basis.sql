-- Product evidence and basis metadata.
--
-- The unrelated username/password-reset statements emitted by drizzle-kit were
-- removed: those changes are already owned by 0003_add_username_and_password_resets.sql.
-- Applying both would attempt to add the same user column twice.
ALTER TABLE "products" ALTER COLUMN "trans_fat_100g" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "nutrition_basis" varchar(10) DEFAULT 'PER_100G' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cholesterol_mg_100g" numeric(8, 2);--> statement-breakpoint
-- A pre-existing row has no record of whether its values were per 100 g or
-- per 100 ml. The default above is only a storage value; it is not evidence of
-- the true basis. Force every legacy row to be re-reviewed before it can be
-- graded or recommended as a swap.
UPDATE "products" SET "is_verified" = false;
