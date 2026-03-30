import { NextResponse } from "next/server";

import { createProviderIntegration, exchangeCodeForTokens } from "@/lib/agencycrm";
import { env } from "@/lib/env";
import { upsertLocationTokens } from "@/lib/repositories/locations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing OAuth code." }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const locationId =
      tokens.locationId ?? searchParams.get("locationId") ?? searchParams.get("location_id");

    if (!locationId) {
      throw new Error("OAuth response did not include a locationId.");
    }

    await upsertLocationTokens({
      location_id: locationId,
      company_id: tokens.companyId ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      installed_at: new Date().toISOString(),
    });

    await createProviderIntegration(locationId, tokens.access_token);

    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/agencycrm/config/tilled?locationId=${encodeURIComponent(locationId)}&installed=1`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth callback failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
