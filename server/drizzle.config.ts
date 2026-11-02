import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Drizzle Kit is CommonJS in this dependency version; use the compiled
  // ESM schema so NodeNext's explicit .js imports resolve correctly.
  schema: './dist/db/schema/*.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/food_scanner_dev',
  },
});
