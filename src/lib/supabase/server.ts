import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
type AppSupabaseClient = SupabaseClient<any, "swypit_ghl", "swypit_ghl">;
let client: AppSupabaseClient | null = null;
export function getSupabaseAdminClient(): AppSupabaseClient {
  if (!client) {
    client = createClient<any, "swypit_ghl", "swypit_ghl">(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        db: {
          schema: "swypit_ghl",
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
  return client;
}