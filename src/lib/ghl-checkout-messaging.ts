/**
 * HighLevel / Agency CRM embedded checkout postMessage helpers.
 *
 * GHL's parent frame often JSON.parse(event.data). Sending a plain object causes
 * "Unable to parse event message" — always stringify outbound payloads.
 */

export type PaymentInitiateProps = {
  type: "payment_initiate_props";
  amount: number;
  currency: string;
  orderId?: string;
  invoiceId?: string;
  locationId: string;
  transactionId?: string;
  description?: string;
  publishableKey?: string;
  contactId?: string;
  contact?: { id?: string };
  paymentMethodId?: string;
  paymentToken?: string;
  paymentMethod?: { id?: string; token?: string };
};

export type SetupInitiateProps = {
  type: "setup_initiate_props";
  locationId: string;
  publishableKey?: string;
  contactId?: string;
  contact?: { id?: string };
};

export type ParentMessage = PaymentInitiateProps | SetupInitiateProps;

/** Hostname suffixes allowed for inbound postMessage (parent → iframe). */
export const GHL_PARENT_ORIGIN_SUFFIXES = [
  "gohighlevel.com",
  "leadconnectorhq.com",
  "msgsndr.com",
  "highlevel.com",
  "agencycrm.com",
] as const;

export function isTrustedParentOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (!origin || origin === "null") return false;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    return GHL_PARENT_ORIGIN_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function unwrapMessagePayload(parsed: Record<string, unknown>): ParentMessage | null {
  if (typeof parsed.type === "string") {
    return parsed as ParentMessage;
  }

  const nested = parsed.data ?? parsed.message ?? parsed.payload;
  if (typeof nested === "object" && nested !== null && "type" in nested) {
    return nested as ParentMessage;
  }

  return null;
}

export function parseParentMessage(data: unknown): ParentMessage | null {
  if (data == null) return null;

  let parsed: unknown = data;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  return unwrapMessagePayload(parsed as Record<string, unknown>);
}

/**
 * GHL docs: payment_initiate_props.amount is decimal major units (e.g. 100 = $100).
 * Integer values >= 1000 are treated as minor units (cents).
 */
export function normalizeGhlPaymentAmount(amount: unknown): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (Number.isInteger(value) && value >= 1000) {
    return value / 100;
  }
  return value;
}

/** Outbound to parent — stringified for GHL's JSON.parse handler. */
export function postMessageToParent(
  message: Record<string, unknown>,
  targetOrigin: string = "*",
) {
  if (typeof window === "undefined") return;
  window.parent.postMessage(JSON.stringify(message), targetOrigin);
}

export function buildProviderReadyMessage() {
  return {
    type: "custom_provider_ready" as const,
    loaded: true,
  };
}
