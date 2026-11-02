CREATE TABLE IF NOT EXISTS "guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_sessions_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"device_id" varchar(128),
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"phone_number" varchar(30),
	"password_hash" varchar(255),
	"google_id" varchar(128),
	"name" varchar(150),
	"avatar_url" text,
	"role" varchar(20) DEFAULT 'USER' NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barcode_gtin" varchar(14) NOT NULL,
	"formulation_version" integer DEFAULT 1 NOT NULL,
	"brand_name" varchar(100) NOT NULL,
	"product_name" varchar(200) NOT NULL,
	"category_slug" varchar(100) NOT NULL,
	"subcategory_slug" varchar(100) NOT NULL,
	"form" varchar(10) NOT NULL,
	"package_weight_g" numeric(8, 2) NOT NULL,
	"serving_size_g" numeric(8, 2) NOT NULL,
	"mrp_inr" numeric(8, 2) NOT NULL,
	"energy_kcal_100g" numeric(6, 2) NOT NULL,
	"protein_g_100g" numeric(6, 2) NOT NULL,
	"carbs_g_100g" numeric(6, 2) NOT NULL,
	"added_sugar_100g" numeric(6, 2),
	"total_sugar_100g" numeric(6, 2) NOT NULL,
	"added_fat_100g" numeric(6, 2),
	"total_fat_100g" numeric(6, 2) NOT NULL,
	"saturated_fat_100g" numeric(6, 2) NOT NULL,
	"trans_fat_100g" numeric(6, 2) NOT NULL,
	"sodium_mg_100g" numeric(8, 2) NOT NULL,
	"salt_g_100g" numeric(6, 2) NOT NULL,
	"dietary_fiber_100g" numeric(6, 2),
 "allergen_tags" text[] DEFAULT '{}'::text[] NOT NULL,
 "high_gi_carb_tags" text[] DEFAULT '{}'::text[] NOT NULL,
 "ins_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"ingredients_raw_text" text NOT NULL,
	"data_provenance" varchar(50) NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingestion_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barcode_gtin" varchar(14) NOT NULL,
	"submitted_by_user_id" uuid,
	"device_id" varchar(100),
	"product_name" varchar(200) NOT NULL,
	"brand_name" varchar(100) NOT NULL,
	"category_slug" varchar(100) NOT NULL,
	"form" varchar(10) NOT NULL,
	"package_weight_g" numeric(8, 2) NOT NULL,
	"serving_size_g" numeric(8, 2) NOT NULL,
	"mrp_inr" numeric(8, 2),
	"ocr_raw_text" text,
	"nutrition_json" jsonb NOT NULL,
	"ingredients_raw_text" text NOT NULL,
	"plausibility_confidence" varchar(20) NOT NULL,
	"review_status" varchar(30) DEFAULT 'PENDING_REVIEW' NOT NULL,
	"is_promoted_to_catalog" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "barcode_formulation_idx" ON "products" ("barcode_gtin","formulation_version");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingestion_submissions" ADD CONSTRAINT "ingestion_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
