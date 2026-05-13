import { fail, ok } from "@/lib/api";
import { getTilledConfig } from "@/lib/repositories/locations";

/**
 * Returns the non-secret Tilled config needed by the client to initialise Tilled.js.
 * Only publishable key, merchant account id, and sandbox flag are exposed — never secrets.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");

    if (!locationId) {
      throw new Error("locationId is required.");
    }

    const config = await getTilledConfig(locationId);

    if (!config) {
      throw new Error("No payment provider config found for this location.");
    }

    if (!config.publishable_key) {
      throw new Error("Payment provider is not fully configured for this location.");
    }

    return ok({
      publishableKey: config.publishable_key,
      merchantAccountId: config.merchant_account_id,
      sandbox: config.mode === "test",
    });
  } catch (error) {
    return fail(error, 400);
  }
}
