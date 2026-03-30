import { createProviderIntegration, getFreshLocationAccessToken } from "@/lib/agencycrm";
import { fail, ok, parseRequestBody } from "@/lib/api";
import { agencyCrmOauthInstallSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, agencyCrmOauthInstallSchema);
    const accessToken = await getFreshLocationAccessToken(payload.locationId);
    const integration = await createProviderIntegration(payload.locationId, accessToken);

    return ok({
      message: "Agency CRM custom payment provider created for location.",
      integration,
    });
  } catch (error) {
    return fail(error, 400);
  }
}
