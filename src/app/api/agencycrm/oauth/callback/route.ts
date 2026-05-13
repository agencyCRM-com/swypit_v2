import { NextResponse } from "next/server";

import { createProviderIntegration, exchangeCodeForTokens } from "@/lib/agencycrm";
import { env } from "@/lib/env";
import { upsertLocationTokens } from "@/lib/repositories/locations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const queryLocationId = searchParams.get("locationId");
  const queryLocationIdAlt = searchParams.get("location_id");
  const queryKeys = Array.from(searchParams.keys());

  if (!code) {
    return NextResponse.json({ error: "Missing OAuth code." }, { status: 400 });
  }

  try {
    console.info("[agencycrm.oauth.callback] callback received", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      queryKeys,
      queryLocationId,
      queryLocationIdAlt,
    });

    const tokens = await exchangeCodeForTokens(code);
    const tokenDebug = tokens as Record<string, unknown>;
    const tokenLocationId =
      typeof tokenDebug.locationId === "string" ? tokenDebug.locationId : null;
    const tokenUserType = typeof tokenDebug.userType === "string" ? tokenDebug.userType : null;
    const tokenScope = typeof tokenDebug.scope === "string" ? tokenDebug.scope : null;

    console.info("[agencycrm.oauth.callback] token exchange succeeded", {
      tokenKeys: Object.keys(tokenDebug),
      userType: tokenUserType,
      companyId: tokens.companyId ?? null,
      locationIdFromToken: tokenLocationId,
      scope: tokenScope,
      expiresIn: tokens.expires_in,
      hasAccessToken: Boolean(tokens.access_token),
      hasRefreshToken: Boolean(tokens.refresh_token),
    });

    const locationId =
      tokens.locationId ?? searchParams.get("locationId") ?? searchParams.get("location_id");

    console.info("[agencycrm.oauth.callback] resolved install context", {
      locationIdFromToken: tokenLocationId,
      queryLocationId,
      queryLocationIdAlt,
      resolvedLocationId: locationId ?? null,
    });

    if (!locationId) {
      throw new Error("OAuth response did not include a locationId.");
    }

    console.info("[agencycrm.oauth.callback] persisting location tokens", {
      locationId,
      companyId: tokens.companyId ?? null,
      expiresIn: tokens.expires_in,
    });

    await upsertLocationTokens({
      location_id: locationId,
      company_id: tokens.companyId ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      installed_at: new Date().toISOString(),
    });

    console.info("[agencycrm.oauth.callback] creating provider integration", {
      locationId,
      appName: env.GHL_APP_NAME,
    });

    try {
      await createProviderIntegration(locationId, tokens.access_token);
      console.info("[agencycrm.oauth.callback] provider integration created", { locationId });
    } catch (integrationError) {
      // Non-fatal: provider integration may already exist on reinstall.
      // Log and continue so the user still lands on the config page.
      console.warn("[agencycrm.oauth.callback] provider integration call failed (non-fatal)", {
        locationId,
        error: integrationError,
      });
    }

    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/agencycrm/config/tilled?locationId=${encodeURIComponent(locationId)}&installed=1`,
    );
  } catch (error) {
    console.error("[agencycrm.oauth.callback] callback failed", {
      queryKeys,
      queryLocationId,
      queryLocationIdAlt,
      error,
    });
    const message = error instanceof Error ? error.message : "OAuth callback failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
