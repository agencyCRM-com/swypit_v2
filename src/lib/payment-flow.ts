import { notifyPaymentCaptured } from "@/lib/agencycrm";
import {
  getTilledConfig,
  getTilledConfigByProviderApiKey,
  type StoredTilledConfig,
} from "@/lib/repositories/locations";
import {
  getOrderPaymentByOrderId,
  getOrderPaymentByTransactionId,
  upsertOrderPayment,
  upsertRefund,
} from "@/lib/repositories/payments";
import { createPaymentIntent, createRefund, resolvePaymentMethodId } from "@/lib/tilled";
import {
  chargeRequestSchema,
  agencyCrmQuerySchema,
  refundRequestSchema,
  verifyRequestSchema,
  type ChargeRequest,
} from "@/lib/validators";

async function resolveConfigFromLocationOrApiKey(locationId?: string, apiKey?: string) {
  if (locationId) {
    return getTilledConfig(locationId);
  }

  if (apiKey) {
    return getTilledConfigByProviderApiKey(apiKey);
  }

  return null;
}

function buildCapabilities(config: StoredTilledConfig | null) {
  return {
    oneTime: Boolean(config),
    recurring: false,
    offSession: Boolean(config),
  };
}

export async function handleVerify(input: unknown) {
  const payload = verifyRequestSchema.parse(input);
  const config = await getTilledConfig(payload.locationId);

  return {
    success: Boolean(config),
    status: config ? "connected" : "missing_config",
    message: config ? "Tilled provider is configured." : "Tilled provider config is missing.",
    capabilities: buildCapabilities(config),
  };
}

export async function handleCharge(input: unknown) {
  const payload = chargeRequestSchema.parse(input);
  const paymentMethodId = await resolvePaymentMethodId({
    locationId: payload.locationId,
    paymentMethodId: payload.paymentMethod?.id,
    paymentToken: payload.paymentMethod?.token ?? payload.paymentToken,
  });

  const paymentIntent = await createPaymentIntent({
    locationId: payload.locationId,
    amount: payload.amount,
    currency: payload.currency,
    description: payload.description,
    paymentMethodId,
    customerId: payload.customerId,
    action: payload.action,
    metadata: {
      orderId: payload.orderId,
      transactionId: payload.transactionId ?? "",
      customerId: payload.customerId,
    },
  });

  const chargeId = paymentIntent.charges?.[0]?.id ?? null;
  const record = await upsertOrderPayment({
    ghl_order_id: payload.orderId,
    ghl_transaction_id: payload.transactionId ?? null,
    location_id: payload.locationId,
    tilled_payment_intent_id: paymentIntent.id,
    tilled_charge_id: chargeId,
    status: paymentIntent.status,
    amount: payload.amount,
    currency: payload.currency.toUpperCase(),
  });

  const config = await getTilledConfig(payload.locationId);

  if (paymentIntent.status === "succeeded" && chargeId && config) {
    try {
      await notifyPaymentCaptured({
        locationId: payload.locationId,
        chargeId,
        ghlTransactionId: record.ghl_transaction_id,
        amount: payload.amount,
        providerApiKey: config.provider_api_key,
      });
    } catch {
      // Non-blocking for the practice build.
    }
  }

  return {
    success: paymentIntent.status === "succeeded" || paymentIntent.status === "requires_capture",
    status: paymentIntent.status,
    transactionId: record.ghl_transaction_id ?? paymentIntent.id,
    tilled_payment_id: paymentIntent.id,
    chargeId,
    message: paymentIntent.last_payment_error?.message ?? "Payment intent created.",
  };
}

export async function handleRefund(input: unknown) {
  const payload = refundRequestSchema.parse(input);
  const payment =
    (await getOrderPaymentByTransactionId(payload.transactionId)) ??
    (payload.orderId ? await getOrderPaymentByOrderId(payload.orderId) : null);

  if (!payment || !payment.tilled_charge_id) {
    throw new Error("No captured Tilled charge found for the requested marketplace transaction.");
  }

  const refund = await createRefund({
    locationId: payload.locationId,
    chargeId: payment.tilled_charge_id,
    amount: payload.amount,
    currency: payload.currency,
  });

  await upsertRefund({
    ghl_transaction_id: payload.transactionId,
    location_id: payload.locationId,
    tilled_refund_id: refund.id,
    amount: payload.amount,
    currency: payload.currency.toUpperCase(),
    status: refund.status,
  });

  return {
    success: refund.status === "succeeded" || refund.status === "pending",
    status: refund.status,
    reason: refund.status === "succeeded" ? "Refund created." : "Refund submitted and awaiting settlement.",
    tilled_refund_id: refund.id,
  };
}

function mapAgencyCrmChargeQuery(payload: {
  locationId?: string;
  transactionId?: string;
  amount?: number;
  currency?: string;
  chargeDescription?: string;
  contactId?: string;
  paymentMethodId?: string;
}): ChargeRequest {
  if (!payload.locationId || !payload.amount || !payload.currency || !payload.contactId || !payload.paymentMethodId) {
    throw new Error("Missing required Agency CRM charge_payment fields.");
  }

  return chargeRequestSchema.parse({
    locationId: payload.locationId,
    orderId: payload.transactionId ?? `txn_${Date.now()}`,
    transactionId: payload.transactionId,
    action: "capture",
    amount: payload.amount,
    currency: payload.currency,
    description: payload.chargeDescription ?? "Agency CRM saved payment method charge",
    customerId: payload.contactId,
    paymentMethod: {
      id: payload.paymentMethodId,
      type: "card",
    },
  });
}

export async function handleAgencyCrmQuery(input: unknown) {
  const payload = agencyCrmQuerySchema.parse(input);
  const config = await resolveConfigFromLocationOrApiKey(payload.locationId, payload.apiKey);

  if (!config) {
    throw new Error("No payment provider config matches this request.");
  }

  if (payload.apiKey && payload.apiKey !== config.provider_api_key) {
    throw new Error("Invalid provider apiKey.");
  }

  const requestType = payload.type ?? payload.action;
  switch (requestType) {
    case "verify":
      return handleVerify({ locationId: config.location_id, action: "verify" });
    case "refund":
      return handleRefund({
        locationId: config.location_id,
        transactionId: payload.transactionId,
        orderId: payload.orderId,
        amount: payload.amount,
        currency: payload.currency,
      });
    case "list_payment_methods":
      return [];
    case "charge_payment":
      return handleCharge(mapAgencyCrmChargeQuery({ ...payload, locationId: config.location_id }));
    default:
      throw new Error(`Unsupported Agency CRM query type: ${requestType ?? "unknown"}`);
  }
}
