import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Swypit Agency CRM Provider"),
  GHL_CLIENT_ID: z.string().min(1).default("placeholder-ghl-client-id"),
  GHL_CLIENT_SECRET: z.string().min(1).default("placeholder-ghl-client-secret"),
  GHL_APP_ID: z.string().min(1).default("placeholder-ghl-app-id"),
  GHL_APP_NAME: z.string().min(1).default("Swypit Custom Payments"),
  GHL_BASE_URL: z.string().url().default("https://services.leadconnectorhq.com"),
  GHL_MARKETPLACE_BASE_URL: z.string().url().default("https://backend.leadconnectorhq.com"),
  GHL_REDIRECT_URI: z.string().url().default("http://localhost:3000/api/agencycrm/oauth/callback"),
  SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("placeholder-supabase-service-role-key"),
  ENCRYPTION_SECRET: z.string().min(32).default("placeholder-encryption-secret-1234"),
  TILLED_BASE_URL: z.string().url().default("https://sandbox-api.tilled.com"),
  TILLED_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed.");
}

export const env = parsed.data;
