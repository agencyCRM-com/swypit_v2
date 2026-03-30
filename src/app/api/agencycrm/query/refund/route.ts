import { fail, ok, parseRequestBody } from "@/lib/api";
import { handleRefund } from "@/lib/payment-flow";
import { refundRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, refundRequestSchema);
    const result = await handleRefund(payload);
    return ok(result);
  } catch (error) {
    return fail(error, 400);
  }
}
