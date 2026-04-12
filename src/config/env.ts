import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("file:./dev.db"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INTERNAL_SCHEDULER_ENABLED: z.string().optional(),
  SCAN_LOCK_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(240).default(45),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_ENVIRONMENT: z.enum(["production", "sandbox"]).default("production"),
  EBAY_NOTIFICATION_VERIFICATION_TOKEN: z.string().optional(),
  AMAZON_SPAPI_CLIENT_ID: z.string().optional(),
  AMAZON_SPAPI_CLIENT_SECRET: z.string().optional(),
  AMAZON_SPAPI_REFRESH_TOKEN: z.string().optional(),
  AMAZON_SPAPI_AWS_ACCESS_KEY_ID: z.string().optional(),
  AMAZON_SPAPI_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AMAZON_SPAPI_AWS_REGION: z.string().default("us-east-1"),
  AMAZON_MARKETPLACE_ID: z.string().default("A2EUQ1WTGCTBG2"),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  DEMO_MODE: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

const truthyValues = new Set(["1", "true", "yes", "on"]);

function parseBoolean(value?: string): boolean {
  return value ? truthyValues.has(value.trim().toLowerCase()) : false;
}

export const env = {
  ...parsed.data,
  internalSchedulerEnabled: parsed.data.INTERNAL_SCHEDULER_ENABLED
    ? parseBoolean(parsed.data.INTERNAL_SCHEDULER_ENABLED)
    : true,
  scanLockTimeoutMinutes: parsed.data.SCAN_LOCK_TIMEOUT_MINUTES,
  demoModeRequested: parseBoolean(parsed.data.DEMO_MODE),
  hasEbayCredentials: Boolean(parsed.data.EBAY_CLIENT_ID && parsed.data.EBAY_CLIENT_SECRET),
  hasAmazonCredentials: Boolean(
    parsed.data.AMAZON_SPAPI_CLIENT_ID &&
      parsed.data.AMAZON_SPAPI_CLIENT_SECRET &&
      parsed.data.AMAZON_SPAPI_REFRESH_TOKEN &&
      parsed.data.AMAZON_SPAPI_AWS_ACCESS_KEY_ID &&
      parsed.data.AMAZON_SPAPI_AWS_SECRET_ACCESS_KEY
  )
};
