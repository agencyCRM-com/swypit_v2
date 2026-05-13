import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type StoredOrderPayment = {
  ghl_order_id: string;
  ghl_transaction_id: string | null;
  location_id: string;
  tilled_payment_intent_id: string;
  tilled_charge_id: string | null;
  status: string;
  amount: number;
  currency: string;
};

export type StoredRefund = {
  ghl_transaction_id: string;
  location_id: string;
  tilled_refund_id: string;
  amount: number;
  currency: string;
  status: string;
};

export async function upsertOrderPayment(input: StoredOrderPayment) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_order_payments")
    .upsert(input, { onConflict: "ghl_order_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as StoredOrderPayment;
}

export async function getOrderPaymentByOrderId(orderId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_order_payments")
    .select("*")
    .eq("ghl_order_id", orderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredOrderPayment | null;
}

export async function getOrderPaymentByTransactionId(transactionId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_order_payments")
    .select("*")
    .eq("ghl_transaction_id", transactionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredOrderPayment | null;
}

export async function getOrderPaymentByTilledPaymentIntentId(paymentIntentId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_order_payments")
    .select("*")
    .eq("tilled_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredOrderPayment | null;
}

export async function getOrderPaymentByTilledChargeId(chargeId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_order_payments")
    .select("*")
    .eq("tilled_charge_id", chargeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoredOrderPayment | null;
}

export async function upsertRefund(input: StoredRefund) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ghl_transaction_refunds")
    .upsert(input, { onConflict: "ghl_transaction_id,tilled_refund_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as StoredRefund;
}

export async function logIntegrationEvent(input: {
  source: string;
  event_type: string;
  external_id?: string | null;
  payload: unknown;
  location_id?: string | null;
}) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("integration_event_log").insert({
    source: input.source,
    event_type: input.event_type,
    external_id: input.external_id ?? null,
    payload: input.payload,
    location_id: input.location_id ?? null,
  });

  if (error) {
    throw error;
  }
}

/**
 * Returns true if an event with the given source + external_id has already been logged.
 * Used for webhook idempotency to prevent double-processing Tilled retries.
 */
export async function hasIntegrationEvent(source: string, externalId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("integration_event_log")
    .select("id")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
}
