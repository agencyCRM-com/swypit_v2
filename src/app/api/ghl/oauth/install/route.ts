import { createProviderIntegration, getFreshLocationAccessToken } from "@/lib/ghl";
import { fail, ok, parseRequestBody } from "@/lib/api";
import { ghlOauthInstallSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, ghlOauthInstallSchema);
    const accessToken = await getFreshLocationAccessToken(payload.locationId);
    const integration = await createProviderIntegration(payload.locationId, accessToken);

    return ok({
      message: "GHL custom payment provider created for location.",
      integration,
    });
  } catch (error) {
    return fail(error, 400);
  }
}
