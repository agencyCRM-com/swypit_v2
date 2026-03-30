import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { getLocationTokens, getTilledConfig, upsertLocationTokens } from "@/lib/repositories/locations";

type OAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  locationId?: string;
  companyId?: string;
};

type MarketplaceFetchOptions = {
  path: string;
  method?: "GET" | "POST" | "PUT";
  accessToken: string;
  body?: unknown;
  marketplace?: boolean;
};

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildAppUrl(path: string) {
  return `${stripTrailingSlash(env.NEXT_PUBLIC_APP_URL)}${path}`;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return text;
  }
}

async function marketplaceFetch<T>({
  path,
  method = "GET",
  accessToken,
  body,
  marketplace,
}: MarketplaceFetchOptions): Promise<T> {
  const baseUrl = marketplace ? env.GHL_MARKETPLACE_BASE_URL : env.GHL_BASE_URL;
  const response = await fetch(`${stripTrailingSlash(baseUrl)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await parseJsonResponse(response);
    throw new Error(`Agency CRM request failed (${response.status}): ${JSON.stringify(errorBody)}`);
  }

  return (await parseJsonResponse(response)) as T;
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.GHL_CLIENT_ID,
    client_secret: env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.GHL_REDIRECT_URI,
  });

  const response = await fetch(`${stripTrailingSlash(env.GHL_BASE_URL)}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await parseJsonResponse(response);
    throw new Error(`Agency CRM OAuth exchange failed (${response.status}): ${JSON.stringify(errorBody)}`);
  }

  return (await response.json()) as OAuthTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.GHL_CLIENT_ID,
    client_secret: env.GHL_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(`${stripTrailingSlash(env.GHL_BASE_URL)}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await parseJsonResponse(response);
    throw new Error(`Agency CRM token refresh failed (${response.status}): ${JSON.stringify(errorBody)}`);
  }

  return (await response.json()) as OAuthTokenResponse;
}

export async function getFreshLocationAccessToken(locationId: string) {
  const existing = await getLocationTokens(locationId);
  if (!existing) {
    throw new Error(`No stored marketplace tokens for location ${locationId}.`);
  }

  if (new Date(existing.expires_at).getTime() > Date.now() + 60_000) {
    return existing.access_token;
  }

  const refreshed = await refreshAccessToken(existing.refresh_token);
  await upsertLocationTokens({
    location_id: locationId,
    company_id: refreshed.companyId ?? existing.company_id,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    installed_at: existing.installed_at,
  });

  return refreshed.access_token;
}

export function createProviderApiKey() {
  return `agencycrmprov_${randomUUID().replaceAll("-", "")}`;
}

export async function createProviderIntegration(locationId: string, accessToken: string) {
  return marketplaceFetch({
    path: "/payments/custom-provider/provider",
    method: "POST",
    accessToken,
    marketplace: true,
    body: {
      name: env.GHL_APP_NAME,
      description: "Custom Tilled payment gateway for Agency CRM.",
      imageUrl: buildAppUrl("/icon.png"),
      locationId,
      queryUrl: buildAppUrl("/api/agencycrm/query"),
      paymentsUrl: buildAppUrl("/checkout?embedded=agencycrm"),
    },
  });
}

export async function connectProviderConfig({
  locationId,
  mode,
  apiKey,
  publishableKey,
  accessToken,
}: {
  locationId: string;
  mode: "test" | "live";
  apiKey: string;
  publishableKey: string;
  accessToken: string;
}) {
  return marketplaceFetch({
    path: "/payments/custom-provider/connect",
    method: "POST",
    accessToken,
    marketplace: true,
    body: {
      locationId,
      mode,
      apiKey,
      publishableKey,
    },
  });
}

export async function notifyPaymentCaptured({
  locationId,
  chargeId,
  ghlTransactionId,
  amount,
  providerApiKey,
}: {
  locationId: string;
  chargeId: string;
  ghlTransactionId: string | null;
  amount: number;
  providerApiKey: string;
}) {
  const accessToken = await getFreshLocationAccessToken(locationId);

  return marketplaceFetch({
    path: "/payments/custom-provider/webhook",
    method: "POST",
    accessToken,
    marketplace: true,
    body: {
      event: "payment.captured",
      chargeId,
      ghlTransactionId,
      chargeSnapshot: {
        status: "succeeded",
        amount,
        chargeId,
        chargedAt: Math.floor(Date.now() / 1000),
      },
      locationId,
      apiKey: providerApiKey,
    },
  });
}

export async function getProviderContext(locationId: string) {
  const accessToken = await getFreshLocationAccessToken(locationId);
  const tilledConfig = await getTilledConfig(locationId);

  if (!tilledConfig) {
    throw new Error(`No Tilled config found for location ${locationId}.`);
  }

  return {
    accessToken,
    tilledConfig,
  };
}
