import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type StoredLocationToken = {
  location_id: string;
  company_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  installed_at: string;
};

export type StoredTilledConfig = {
  location_id: string;
  mode: "test" | "live";
  merchant_account_id: string;
  provider_api_key: string;
  test_secret_key_encrypted: string;
  live_secret_key_encrypted: string;
  webhook_secret_encrypted: string | null;
  publishable_key: string | null;
  verify_status: string | null;
};

export async function upsertLocationTokens(input: StoredLocationToken) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_location_tokens")
    .upsert(input, { onConflict: "location_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as StoredLocationToken;
}

export async function getLocationTokens(locationId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_location_tokens")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredLocationToken | null;
}

export async function upsertTilledConfig(input: StoredTilledConfig) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tilled_location_configs")
    .upsert(input, { onConflict: "location_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as StoredTilledConfig;
}

export async function getTilledConfig(locationId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tilled_location_configs")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredTilledConfig | null;
}

export async function getTilledConfigByMerchantAccountId(merchantAccountId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tilled_location_configs")
    .select("*")
    .eq("merchant_account_id", merchantAccountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredTilledConfig | null;
}

export async function getTilledConfigByProviderApiKey(providerApiKey: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tilled_location_configs")
    .select("*")
    .eq("provider_api_key", providerApiKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredTilledConfig | null;
}
