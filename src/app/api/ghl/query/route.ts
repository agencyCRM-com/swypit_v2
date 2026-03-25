import { fail, ok } from "@/lib/api";
import { handleGhlQuery } from "@/lib/payment-flow";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const result = await handleGhlQuery(payload);
    return ok(result);
  } catch (error) {
    return fail(error, 400);
  }
}
