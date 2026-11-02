import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  ALLOWED_ORIGINS: z.string().default('http://localhost:8081'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Security & Authentication
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long').default('dev-jwt-secret-food-scanner-must-be-32-chars-long!'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECRET: z.string().min(16).default('dev-cookie-secret-food-scanner-32-chars-key!'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional().default('mock-google-client-id-for-local-dev.apps.googleusercontent.com'),

  // Database & Cache
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/food_scanner_dev'),
  REDIS_URL: z.string().optional(),
}).superRefine((values, ctx) => {
  if (values.NODE_ENV === 'production') {
    if (values.JWT_SECRET.startsWith('dev-jwt-secret-') || values.JWT_SECRET.length < 32) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'A unique production JWT_SECRET of at least 32 characters is required' });
    }
    if (values.COOKIE_SECRET.startsWith('dev-cookie-secret-') || values.COOKIE_SECRET.length < 32) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['COOKIE_SECRET'], message: 'A unique production COOKIE_SECRET of at least 32 characters is required' });
    }
    if (!values.ALLOWED_ORIGINS.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ALLOWED_ORIGINS'], message: 'At least one production origin is required' });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error('Invalid environment configuration');
}

export const env: EnvConfig = parsedEnv.data;
