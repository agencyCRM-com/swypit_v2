import { fail, ok } from "@/lib/api";
import { getFreshLocationAccessToken } from "@/lib/ghl";
import { getLocationTokens } from "@/lib/repositories/locations";

export async function GET(_: Request, context: { params: Promise<{ locationId: string }> }) {
  try {
    const { locationId } = await context.params;
    const tokenRecord = await getLocationTokens(locationId);

    if (!tokenRecord) {
      return fail(new Error("Location token not found."), 404);
    }

    const accessToken = await getFreshLocationAccessToken(locationId);

    return ok({
      locationId,
      companyId: tokenRecord.company_id,
      accessToken,
      refreshToken: tokenRecord.refresh_token,
      expiresAt: tokenRecord.expires_at,
    });
  } catch (error) {
    return fail(error, 400);
  }
}
