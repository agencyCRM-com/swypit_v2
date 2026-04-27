import { fail, ok, parseRequestBody } from "@/lib/api";
import { encryptSecret } from "@/lib/crypto";
import { connectProviderConfig, createProviderApiKey, getFreshLocationAccessToken } from "@/lib/agencycrm";
import { getTilledConfig, upsertTilledConfig } from "@/lib/repositories/locations";
import { verifyTilledConnection } from "@/lib/tilled";
import { tilledConfigSchema } from "@/lib/validators";

function redactSecret(value?: string) {
  if (!value) {
    return { present: false };
  }

  return {
    present: true,
    length: value.length,
    preview: `${value.slice(0, 4)}...${value.slice(-4)}`,
  };
}

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
    console.info("[agencycrm.config.tilled] request received", {
      locationId: payload.locationId,
      mode: payload.mode,
      verify: payload.verify,
      merchantAccountId: payload.tilled_merchant_account_id,
      testSecret: redactSecret(payload.tilled_test_secret_key),
      liveSecret: redactSecret(payload.tilled_live_secret_key),
      publishableKey: redactSecret(payload.tilled_publishable_key),
      webhookSecret: redactSecret(payload.tilled_webhook_secret),
    });

    const existing = await getTilledConfig(payload.locationId);
    console.info("[agencycrm.config.tilled] existing config lookup complete", {
      locationId: payload.locationId,
      hasExistingConfig: Boolean(existing),
    });

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
    console.info("[agencycrm.config.tilled] config saved to supabase", {
      locationId: saved.location_id,
      providerApiKey: saved.provider_api_key,
      mode: saved.mode,
    });

    let verifyStatus = "skipped";
    if (payload.verify) {
      console.info("[agencycrm.config.tilled] starting Tilled verification", {
        locationId: payload.locationId,
        merchantAccountId: payload.tilled_merchant_account_id,
      });
      await verifyTilledConnection(payload.locationId);
      verifyStatus = "verified";
      await upsertTilledConfig({
        ...saved,
        verify_status: verifyStatus,
      });
      console.info("[agencycrm.config.tilled] Tilled verification passed", {
        locationId: payload.locationId,
        verifyStatus,
      });
    }

    try {
      console.info("[agencycrm.config.tilled] attempting provider connect sync", {
        locationId: payload.locationId,
        mode: payload.mode,
      });
      const accessToken = await getFreshLocationAccessToken(payload.locationId);
      await connectProviderConfig({
        locationId: payload.locationId,
        apiKey: saved.provider_api_key,
        publishableKey: payload.tilled_publishable_key || "tilled_publishable_placeholder",
        accessToken,
      });
      console.info("[agencycrm.config.tilled] provider connect sync passed", {
        locationId: payload.locationId,
      });
    } catch (error) {
      console.warn("[agencycrm.config.tilled] provider connect sync failed", {
        locationId: payload.locationId,
        error,
      });
      return ok({
        message: `Config saved, but provider connect sync was skipped: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
        verify_status: verifyStatus,
        provider_api_key: saved.provider_api_key,
      });
    }

    console.info("[agencycrm.config.tilled] request completed successfully", {
      locationId: payload.locationId,
      verifyStatus,
      providerApiKey: saved.provider_api_key,
    });

    return ok({
      message: "Config saved and synced.",
      verify_status: verifyStatus,
      provider_api_key: saved.provider_api_key,
    });
  } catch (error) {
    console.error("[agencycrm.config.tilled] request failed", { error });
    return fail(error, 400);
  }
}
