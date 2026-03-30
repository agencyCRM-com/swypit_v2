import { decryptSecret, verifyWebhookSignature } from "@/lib/crypto";
import { env } from "@/lib/env";
import {
  getTilledConfig,
  getTilledConfigByMerchantAccountId,
  type StoredTilledConfig,
} from "@/lib/repositories/locations";

type TilledRequestOptions = {
  config: StoredTilledConfig;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
};

export type TilledPaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  charges?: Array<{ id: string; status: string }>;
  last_payment_error?: { message?: string };
};

export type TilledRefund = {
  id: string;
  status: string;
  amount: number;
  currency: string;
};

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getSecretKey(config: StoredTilledConfig) {
  return decryptSecret(
    config.mode === "live" ? config.live_secret_key_encrypted : config.test_secret_key_encrypted,
  );
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return text;
  }
}

async function tilledRequest<T>({
  config,
  path,
  method = "GET",
  body,
}: TilledRequestOptions): Promise<T> {
  const url = `${stripTrailingSlash(env.TILLED_BASE_URL)}${path}`;
  console.info("[tilled.request] sending request", {
    method,
    url,
    merchantAccountId: config.merchant_account_id,
    mode: config.mode,
    hasBody: Boolean(body),
  });

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "tilled-account": config.merchant_account_id,
      "tilled-api-key": getSecretKey(config),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  console.info("[tilled.request] response received", {
    method,
    url,
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    const errorBody = await parseJsonResponse(response);
    console.error("[tilled.request] request failed", {
      method,
      url,
      status: response.status,
      errorBody,
    });
    throw new Error(`Tilled request failed (${response.status}): ${JSON.stringify(errorBody)}`);
  }

  return (await parseJsonResponse(response)) as T;
}

function toMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

export async function getResolvedTilledConfig(locationId: string) {
  const config = await getTilledConfig(locationId);
  if (!config) {
    throw new Error(`No Tilled config found for location ${locationId}.`);
  }

  return config;
}

export async function verifyTilledConnection(locationId: string) {
  const config = await getResolvedTilledConfig(locationId);
  return tilledRequest({
    config,
    path: `/v1/accounts/${config.merchant_account_id}`,
  });
}

export async function resolvePaymentMethodId({
  locationId,
  paymentMethodId,
  paymentToken,
}: {
  locationId: string;
  paymentMethodId?: string;
  paymentToken?: string;
}) {
  if (paymentMethodId) {
    return paymentMethodId;
  }

  if (!paymentToken) {
    throw new Error("A payment method id or payment token is required.");
  }

  if (paymentToken.startsWith("pm_")) {
    return paymentToken;
  }

  const config = await getResolvedTilledConfig(locationId);
  const created = await tilledRequest<{ id: string }>({
    config,
    path: "/v1/payment-methods",
    method: "POST",
    body: {
      type: "card",
      token: paymentToken,
    },
  });

  return created.id;
}

export async function createPaymentIntent(input: {
  locationId: string;
  amount: number;
  currency: string;
  description: string;
  paymentMethodId: string;
  customerId?: string;
  action: "capture" | "authorize";
  metadata?: Record<string, string>;
}) {
  const config = await getResolvedTilledConfig(input.locationId);
  return tilledRequest<TilledPaymentIntent>({
    config,
    path: "/v1/payment-intents",
    method: "POST",
    body: {
      amount: toMinorUnits(input.amount),
      currency: input.currency.toLowerCase(),
      description: input.description,
      payment_method_types: ["card"],
      payment_method_id: input.paymentMethodId,
      customer_id: input.customerId,
      confirm: true,
      capture_method: input.action === "authorize" ? "manual" : "automatic",
      metadata: input.metadata,
    },
  });
}

export async function capturePaymentIntent(locationId: string, paymentIntentId: string) {
  const config = await getResolvedTilledConfig(locationId);
  return tilledRequest<TilledPaymentIntent>({
    config,
    path: `/v1/payment-intents/${paymentIntentId}/capture`,
    method: "POST",
  });
}

export async function createRefund(input: {
  locationId: string;
  chargeId: string;
  amount: number;
  currency: string;
}) {
  const config = await getResolvedTilledConfig(input.locationId);
  return tilledRequest<TilledRefund>({
    config,
    path: `/v1/charges/${input.chargeId}/refunds`,
    method: "POST",
    body: {
      amount: toMinorUnits(input.amount),
      currency: input.currency.toLowerCase(),
    },
  });
}

export async function verifyTilledWebhook(body: string, signature: string | null, merchantAccountId: string) {
  const config = await getTilledConfigByMerchantAccountId(merchantAccountId);
  if (!config || !config.webhook_secret_encrypted) {
    return false;
  }

  return verifyWebhookSignature({
    body,
    signature,
    secret: decryptSecret(config.webhook_secret_encrypted),
    toleranceSeconds: env.TILLED_WEBHOOK_TOLERANCE_SECONDS,
  });
}
