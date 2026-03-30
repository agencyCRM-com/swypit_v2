import { fail, ok, parseRequestBody } from "@/lib/api";
import { handleCharge } from "@/lib/payment-flow";
import { chargeRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, chargeRequestSchema);
    const result = await handleCharge(payload);
    return ok(result);
  } catch (error) {
    return fail(error, 400);
  }
}
