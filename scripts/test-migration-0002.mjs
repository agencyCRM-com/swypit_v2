/**
 * Executes migration 0002 regression tests (DB + HTTP).
 * Usage: node --env-file=.env scripts/test-migration-0002.mjs
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
const WEBHOOK_TEST_SECRET = process.env.TEST_TILLED_WEBHOOK_SECRET ?? "whsec_test_migration_0002";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ENCRYPTION_SECRET) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or ENCRYPTION_SECRET in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "swypit_ghl" },
  auth: { persistSession: false },
});

function encryptSecret(plainText) {
  const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptSecret(cipherText) {
  const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
  const buffer = Buffer.from(cipherText, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function signWebhook(body, secret) {
  const t = Math.floor(Date.now() / 1000);
  const payload = `${t}.${body}`;
  const v1 = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function hasIntegrationEvent(source, externalId) {
  const { data, error } = await supabase
    .from("integration_event_log")
    .select("id")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getTestConfig() {
  const { data, error } = await supabase
    .from("tilled_location_configs")
    .select("location_id, merchant_account_id, provider_api_key, webhook_secret_encrypted")
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

async function ensureWebhookSecret(config) {
  const encrypted = encryptSecret(WEBHOOK_TEST_SECRET);
  const { error } = await supabase
    .from("tilled_location_configs")
    .update({ webhook_secret_encrypted: encrypted })
    .eq("location_id", config.location_id);
  if (error) throw error;

  const { data, error: readError } = await supabase
    .from("tilled_location_configs")
    .select("webhook_secret_encrypted")
    .eq("location_id", config.location_id)
    .single();
  if (readError) throw readError;

  const decrypted = decryptSecret(data.webhook_secret_encrypted);
  assert(
    decrypted === WEBHOOK_TEST_SECRET,
    "Webhook secret roundtrip failed — ENCRYPTION_SECRET in .env may not match the running dev server",
  );
  console.log("  (webhook test secret configured for test location)");
}

async function testWebhookDedup(config) {
  console.log("\n[3A] Webhook idempotency");
  const eventId = `evt_test_${Date.now()}`;
  const body = JSON.stringify({
    id: eventId,
    account_id: config.merchant_account_id,
    type: "payment_intent.succeeded",
    data: { id: `pi_test_${Date.now()}`, status: "succeeded" },
  });
  const signature = signWebhook(body, WEBHOOK_TEST_SECRET);

  const post = async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/tilled`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "payments-signature": signature,
      },
      body,
    });
    return { status: res.status, json: await res.json() };
  };

  const first = await post();
  assert(first.status === 200, `First webhook expected 200, got ${first.status}: ${JSON.stringify(first.json)}`);
  assert(first.json?.data?.received === true, "First webhook should be received");
  assert(!first.json?.data?.duplicate, "First webhook should not be duplicate");

  const { count: countAfterFirst } = await supabase
    .from("integration_event_log")
    .select("*", { count: "exact", head: true })
    .eq("source", "tilled")
    .eq("external_id", eventId);
  assert(countAfterFirst === 1, `Expected 1 log row after first webhook, got ${countAfterFirst}`);

  const second = await post();
  assert(second.status === 200, `Second webhook expected 200, got ${second.status}`);
  assert(second.json?.data?.duplicate === true, "Second webhook should be duplicate");

  const { count: countAfterSecond } = await supabase
    .from("integration_event_log")
    .select("*", { count: "exact", head: true })
    .eq("source", "tilled")
    .eq("external_id", eventId);
  assert(countAfterSecond === 1, `Expected still 1 log row after duplicate, got ${countAfterSecond}`);
  console.log("  PASS");
}

async function testChargeIdempotency(config) {
  console.log("\n[3B] Charge idempotency");
  const orderId = `order_test_${Date.now()}`;
  const txnId = `txn_test_${Date.now()}`;

  // Seed an existing succeeded payment so the second charge never hits Tilled.
  const { error: seedError } = await supabase.from("ghl_order_payments").insert({
    ghl_order_id: orderId,
    ghl_transaction_id: txnId,
    location_id: config.location_id,
    tilled_payment_intent_id: `pi_seed_${Date.now()}`,
    tilled_charge_id: `ch_seed_${Date.now()}`,
    status: "succeeded",
    amount: 1.0,
    currency: "USD",
  });
  if (seedError) throw seedError;

  const payload = {
    locationId: config.location_id,
    orderId,
    transactionId: txnId,
    action: "capture",
    amount: 1.0,
    currency: "USD",
    description: "Migration 0002 idempotency test",
    customerId: "contact_test_001",
    paymentMethod: { id: "pm_test_placeholder", type: "card" },
  };

  const charge = async () => {
    const res = await fetch(`${BASE_URL}/api/agencycrm/payment/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: res.status, json: await res.json() };
  };

  const result = await charge();
  assert(result.status === 200, `Idempotent charge failed: ${JSON.stringify(result.json)}`);
  assert(result.json?.data?.success === true, "Should return existing payment");
  assert(
    result.json?.data?.message?.includes("already processed") ||
      result.json?.data?.message?.includes("Payment already"),
    "Should return idempotent message",
  );

  const { count } = await supabase
    .from("ghl_order_payments")
    .select("*", { count: "exact", head: true })
    .eq("ghl_order_id", orderId);
  assert(count === 1, "Expected exactly one payment row");
  console.log("  PASS");

  await supabase.from("ghl_order_payments").delete().eq("ghl_order_id", orderId);
}

async function testQueryVerifyAndRefund(config) {
  console.log("\n[3D] Query verify by apiKey");

  const verifyRes = await fetch(`${BASE_URL}/api/agencycrm/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: config.provider_api_key, type: "verify" }),
  });
  const verifyJson = await verifyRes.json();
  assert(verifyRes.status === 200, `Verify failed: ${JSON.stringify(verifyJson)}`);
  assert(verifyJson?.data?.success === true, "Verify should succeed");

  const badRes = await fetch(`${BASE_URL}/api/agencycrm/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "invalid_api_key_0002", type: "verify" }),
  });
  assert(badRes.status === 400, "Invalid apiKey should return 400");
  console.log("  verify PASS");

  console.log("\n[3C] Refund by transactionId (lookup path)");
  const missingTxn = `txn_missing_${Date.now()}`;
  const badRefundRes = await fetch(`${BASE_URL}/api/agencycrm/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: config.provider_api_key,
      type: "refund",
      locationId: config.location_id,
      transactionId: missingTxn,
      amount: 1.0,
      currency: "USD",
    }),
  });
  assert(badRefundRes.status === 400, "Refund with unknown transactionId should fail");

  const refundTxnId = `txn_refund_${Date.now()}`;
  const refundOrderId = `order_refund_${Date.now()}`;
  const { error: paySeedError } = await supabase.from("ghl_order_payments").insert({
    ghl_order_id: refundOrderId,
    ghl_transaction_id: refundTxnId,
    location_id: config.location_id,
    tilled_payment_intent_id: `pi_refund_${Date.now()}`,
    tilled_charge_id: null,
    status: "succeeded",
    amount: 1.0,
    currency: "USD",
  });
  if (paySeedError) throw paySeedError;

  const noChargeRes = await fetch(`${BASE_URL}/api/agencycrm/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: config.provider_api_key,
      type: "refund",
      locationId: config.location_id,
      transactionId: refundTxnId,
      amount: 1.0,
      currency: "USD",
    }),
  });
  assert(noChargeRes.status === 400, "Refund without tilled_charge_id should fail");
  console.log("  lookup + error paths PASS");

  await supabase.from("ghl_order_payments").delete().eq("ghl_order_id", refundOrderId);

  if (!process.env.TEST_REFUND_TRANSACTION_ID) {
    console.log("  live refund SKIP (set TEST_REFUND_TRANSACTION_ID for Tilled refund success)");
    return;
  }

  const refundRes = await fetch(`${BASE_URL}/api/agencycrm/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: config.provider_api_key,
      type: "refund",
      locationId: config.location_id,
      transactionId: process.env.TEST_REFUND_TRANSACTION_ID,
      amount: 1.0,
      currency: "USD",
    }),
  });
  const refundJson = await refundRes.json();
  assert(refundRes.status === 200, `Refund failed: ${JSON.stringify(refundJson)}`);
  assert(refundJson?.data?.success === true, "Refund should succeed");
  console.log("  live refund PASS");
}

async function testHasIntegrationEventDirect() {
  console.log("\n[DB] hasIntegrationEvent pattern");
  const externalId = `evt_direct_${Date.now()}`;
  assert((await hasIntegrationEvent("tilled", externalId)) === false, "Should not exist yet");

  const { error } = await supabase.from("integration_event_log").insert({
    source: "tilled",
    event_type: "test",
    external_id: externalId,
    payload: { test: true },
  });
  if (error) throw error;

  assert((await hasIntegrationEvent("tilled", externalId)) === true, "Should exist after insert");
  console.log("  PASS");

  await supabase
    .from("integration_event_log")
    .delete()
    .eq("source", "tilled")
    .eq("external_id", externalId);
}

async function main() {
  console.log("Migration 0002 + path regression tests");
  console.log(`App: ${BASE_URL}`);

  const config = await getTestConfig();
  console.log(`Location: ${config.location_id}`);
  await ensureWebhookSecret(config);

  await testHasIntegrationEventDirect();
  await testWebhookDedup(config);
  await testQueryVerifyAndRefund(config);
  await testChargeIdempotency(config);

  console.log("\nAll executed tests passed.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
