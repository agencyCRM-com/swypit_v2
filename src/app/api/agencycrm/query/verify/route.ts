import { fail, ok, parseRequestBody } from "@/lib/api";
import { handleVerify } from "@/lib/payment-flow";
import { verifyRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, verifyRequestSchema);
    const result = await handleVerify(payload);
    return ok(result);
  } catch (error) {
    return fail(error, 400);
  }
}
