import { fail, ok } from "@/lib/api";
import { getTilledConfigByMerchantAccountId } from "@/lib/repositories/locations";
import {
  getOrderPaymentByTilledChargeId,
  getOrderPaymentByTilledPaymentIntentId,
  logIntegrationEvent,
  upsertOrderPayment,
  upsertRefund,
} from "@/lib/repositories/payments";
import { verifyTilledWebhook } from "@/lib/tilled";

type TilledWebhookPayload = {
  id: string;
  account_id: string;
  type: string;
  data: Record<string, unknown>;
};

function toMajorUnits(value: unknown) {
  return typeof value === "number" ? value / 100 : 0;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody) as TilledWebhookPayload;

    if (!payload.account_id) {
      throw new Error("Missing Tilled account_id.");
    }

    const isValid = await verifyTilledWebhook(
      rawBody,
      request.headers.get("payments-signature"),
      payload.account_id,
    );

    if (!isValid) {
      return fail(new Error("Invalid webhook signature."), 401);
    }

    const config = await getTilledConfigByMerchantAccountId(payload.account_id);
    await logIntegrationEvent({
      source: "tilled",
      event_type: payload.type,
      external_id: payload.id,
      location_id: config?.location_id ?? null,
      payload,
    });

    if (payload.type.startsWith("payment_intent.")) {
      const paymentIntentId = String(payload.data.id ?? "");
      const existing = await getOrderPaymentByTilledPaymentIntentId(paymentIntentId);

      if (existing) {
        await upsertOrderPayment({
          ...existing,
          tilled_charge_id:
            (Array.isArray(payload.data.charges) ? (payload.data.charges[0] as { id?: string })?.id : null) ??
            existing.tilled_charge_id,
          status: String(payload.data.status ?? existing.status),
        });
      }
    }

    if (payload.type === "charge.refunded" || payload.type === "charge.refund.updated") {
      const chargeId = String(payload.data.charge_id ?? payload.data.chargeId ?? "");
      const refundId = String(payload.data.id ?? "");
      const existing = chargeId ? await getOrderPaymentByTilledChargeId(chargeId) : null;

      if (existing?.ghl_transaction_id && refundId) {
        await upsertRefund({
          ghl_transaction_id: existing.ghl_transaction_id,
          location_id: existing.location_id,
          tilled_refund_id: refundId,
          amount: toMajorUnits(payload.data.amount),
          currency: String(payload.data.currency ?? existing.currency),
          status: String(payload.data.status ?? payload.type),
        });
      }
    }

    return ok({ received: true });
  } catch (error) {
    return fail(error, 400);
  }
}
