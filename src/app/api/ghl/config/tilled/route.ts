import { fail, ok, parseRequestBody } from "@/lib/api";
import { encryptSecret } from "@/lib/crypto";
import { connectProviderConfig, createProviderApiKey, getFreshLocationAccessToken } from "@/lib/ghl";
import { getTilledConfig, upsertTilledConfig } from "@/lib/repositories/locations";
import { verifyTilledConnection } from "@/lib/tilled";
import { tilledConfigSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");

    if (!locationId) {
      throw new Error("locationId is required.");
    }

    const config = await getTilledConfig(locationId);
    if (!config) {
      return ok({
        locationId,
        mode: "test",
        tilled_merchant_account_id: "",
        tilled_test_secret_key: "",
        tilled_live_secret_key: "",
        tilled_publishable_key: "",
        verify_status: null,
      });
    }

    return ok({
      locationId: config.location_id,
      mode: config.mode,
      tilled_merchant_account_id: config.merchant_account_id,
      tilled_test_secret_key: "",
      tilled_live_secret_key: "",
      tilled_publishable_key: config.publishable_key ?? "",
      tilled_webhook_secret: "",
      verify_status: config.verify_status,
    });
  } catch (error) {
    return fail(error, 400);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, tilledConfigSchema);
    const existing = await getTilledConfig(payload.locationId);

    const saved = await upsertTilledConfig({
      location_id: payload.locationId,
      mode: payload.mode,
      merchant_account_id: payload.tilled_merchant_account_id,
      provider_api_key: existing?.provider_api_key ?? createProviderApiKey(),
      test_secret_key_encrypted: encryptSecret(payload.tilled_test_secret_key),
      live_secret_key_encrypted: encryptSecret(payload.tilled_live_secret_key),
      webhook_secret_encrypted: payload.tilled_webhook_secret
        ? encryptSecret(payload.tilled_webhook_secret)
        : existing?.webhook_secret_encrypted ?? null,
      publishable_key: payload.tilled_publishable_key || existing?.publishable_key || null,
      verify_status: "pending",
    });

    let verifyStatus = "skipped";
    if (payload.verify) {
      await verifyTilledConnection(payload.locationId);
      verifyStatus = "verified";
      await upsertTilledConfig({
        ...saved,
        verify_status: verifyStatus,
      });
    }

    try {
      const accessToken = await getFreshLocationAccessToken(payload.locationId);
      await connectProviderConfig({
        locationId: payload.locationId,
        mode: payload.mode,
        apiKey: saved.provider_api_key,
        publishableKey: payload.tilled_publishable_key || "tilled_publishable_placeholder",
        accessToken,
      });
    } catch (error) {
      return ok({
        message: `Config saved, but GHL connect sync was skipped: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
        verify_status: verifyStatus,
        provider_api_key: saved.provider_api_key,
      });
    }

    return ok({
      message: "Config saved and synced to GHL.",
      verify_status: verifyStatus,
      provider_api_key: saved.provider_api_key,
    });
  } catch (error) {
    return fail(error, 400);
  }
}
