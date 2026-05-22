"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TilledCardForm, type TilledCardFormHandle } from "@/app/checkout/TilledCardForm";
import {
  buildProviderReadyMessage,
  normalizePaymentInitiateProps,
  parseParentMessage,
  postMessageToParent,
  isTrustedParentOrigin,
} from "@/lib/ghl-checkout-messaging";

// ── Types ──────────────────────────────────────────────────────────────────────

type PaymentProps = {
  amount: number;
  currency: string;
  description: string;
  orderId: string;
  locationId: string;
  customerId: string;
  transactionId?: string;
};

type TilledConfig = {
  publishableKey: string;
  merchantAccountId: string;
  sandbox: boolean;
};

type ChargeResponse = {
  error?: string;
  tilled_payment_id?: string;
  transactionId?: string;
  chargeId?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatAmount(currency: string, amount: number): string {
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

const inputStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  width: "100%",
  boxSizing: "border-box",
  fontSize: "14px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#374151",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function CheckoutClient({
  initialEmbedded,
  initialPaymentProps,
  initialPaymentMethodId,
  initialPaymentToken,
  showDebugFields,
}: {
  initialEmbedded: boolean;
  initialPaymentProps: PaymentProps;
  initialPaymentMethodId?: string;
  initialPaymentToken?: string;
  showDebugFields: boolean;
}) {
  const [paymentProps, setPaymentProps] = useState<PaymentProps>(initialPaymentProps);
  const [paymentMethodId, setPaymentMethodId] = useState(initialPaymentMethodId ?? "");
  const [paymentToken, setPaymentToken] = useState(initialPaymentToken ?? "");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);
  // Tracks whether we have received payment_initiate_props from the parent in embedded mode.
  const [hasReceivedProps, setHasReceivedProps] = useState(!initialEmbedded);
  // Verified origin of the parent frame (set on first trusted inbound message).
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  // Tilled public config (publishable key) fetched per location.
  const [tilledConfig, setTilledConfig] = useState<TilledConfig | null>(null);
  const [cardFormReady, setCardFormReady] = useState(false);
  const [propsTimeout, setPropsTimeout] = useState(false);

  const cardFormRef = useRef<TilledCardFormHandle>(null);
  // Always holds the latest submitPayment to avoid stale closures in effects.
  const submitPaymentRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // Parse allowed origins from the env variable baked in at build time.
  const allowedOrigins = useMemo<string[]>(() => {
    const raw = process.env.NEXT_PUBLIC_GHL_ORIGIN ?? "";
    return raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }, []);

  // ── Fetch Tilled public config when locationId is available ─────────────────

  useEffect(() => {
    if (!paymentProps.locationId) return;

    void fetch(`/api/tilled/config?locationId=${encodeURIComponent(paymentProps.locationId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<TilledConfig>) : Promise.resolve(null)))
      .then((data) => setTilledConfig(data))
      .catch(() => setTilledConfig(null));
  }, [paymentProps.locationId]);

  // ── Listen for parent messages (embedded only) ───────────────────────────────

  useEffect(() => {
    if (!initialEmbedded || typeof window === "undefined") return;

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedParentOrigin(event.origin, allowedOrigins)) {
        return;
      }

      const message = parseParentMessage(event.data);
      if (!message) return;

      if (message.type === "payment_initiate_props") {
        const normalized = normalizePaymentInitiateProps(message);
        if (!normalized) return;

        setParentOrigin(event.origin);
        setPropsTimeout(false);
        setPaymentProps({
          amount: normalized.amount,
          currency: normalized.currency,
          description: normalized.description,
          orderId: normalized.orderId,
          locationId: normalized.locationId,
          customerId: normalized.customerId,
          transactionId: normalized.transactionId,
        });
        setPaymentMethodId(normalized.paymentMethodId ?? "");
        setPaymentToken(normalized.paymentToken ?? "");
        setHasAutoSubmitted(false);
        setHasReceivedProps(true);

        if (normalized.publishableKey) {
          setTilledConfig((current) =>
            current?.publishableKey === normalized.publishableKey
              ? current
              : {
                  publishableKey: normalized.publishableKey!,
                  merchantAccountId: current?.merchantAccountId ?? "",
                  sandbox: current?.sandbox ?? true,
                },
          );
        }
      }

      if (message.type === "setup_initiate_props") {
        setParentOrigin(event.origin);
        setPropsTimeout(false);
        setPaymentProps((cur) => ({
          ...cur,
          locationId: message.locationId,
          customerId: message.contactId ?? message.contact?.id ?? "",
        }));
        setHasReceivedProps(true);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowedOrigins, initialEmbedded]);

  // ── Signal custom_provider_ready (stringified JSON for GHL parent parser) ───

  useEffect(() => {
    if (!initialEmbedded || typeof window === "undefined" || hasReceivedProps) return;

    const signalReady = () => {
      postMessageToParent(buildProviderReadyMessage(), "*");
    };

    signalReady();
    const readyInterval = window.setInterval(signalReady, 2_000);
    return () => window.clearInterval(readyInterval);
  }, [hasReceivedProps, initialEmbedded]);

  useEffect(() => {
    if (!initialEmbedded || hasReceivedProps) return;
    const timer = window.setTimeout(() => setPropsTimeout(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [hasReceivedProps, initialEmbedded]);

  // ── Derived state ────────────────────────────────────────────────────────────

  /**
   * Show Tilled hosted card fields when no saved method/token is available
   * and the Tilled public config has been fetched successfully.
   */
  const showCardForm = Boolean(tilledConfig?.publishableKey && !paymentMethodId && !paymentToken);

  const canSubmit = useMemo(() => {
    const hasSavedMethod = Boolean(paymentMethodId || paymentToken);
    const hasNewCard = showCardForm && cardFormReady;
    return Boolean(
      paymentProps.locationId &&
        paymentProps.orderId &&
        paymentProps.customerId &&
        paymentProps.amount > 0 &&
        (hasSavedMethod || hasNewCard),
    );
  }, [cardFormReady, paymentMethodId, paymentProps, paymentToken, showCardForm]);

  const missingFields = useMemo<string[] | null>(() => {
    if (!initialEmbedded || !hasReceivedProps) return null;
    const missing: string[] = [];
    if (!paymentProps.locationId) missing.push("Location ID");
    if (!paymentProps.orderId) {
      missing.push("Order ID (orderId, invoiceId, or transactionId from invoice)");
    }
    if (!paymentProps.customerId) missing.push("Customer ID");
    if (paymentProps.amount <= 0) missing.push("Amount");
    return missing.length > 0 ? missing : null;
  }, [initialEmbedded, hasReceivedProps, paymentProps]);

  // ── Parent postMessage helper ────────────────────────────────────────────────

  function postToParent(message: Record<string, unknown>) {
    const target = parentOrigin ?? allowedOrigins[0] ?? "*";
    postMessageToParent(message, target);
  }

  // ── Payment execution ────────────────────────────────────────────────────────

  async function submitPayment() {
    setIsSubmitting(true);
    setStatus("");

    let resolvedMethodId = paymentMethodId;

    // If showing card form, tokenize first.
    if (showCardForm && cardFormRef.current) {
      try {
        resolvedMethodId = await cardFormRef.current.tokenize();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Card tokenization failed.";
        setStatus(message);
        setIsSubmitting(false);
        if (initialEmbedded) {
          postToParent({ type: "custom_element_error_response", error: { description: message } });
        }
        return;
      }
    }

    const response = await fetch("/api/tilled/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...paymentProps,
        action: "capture",
        paymentMethod: resolvedMethodId ? { id: resolvedMethodId, type: "card" } : undefined,
        paymentToken: paymentToken || undefined,
      }),
    });

    const payload = (await response.json()) as ChargeResponse;
    setIsSubmitting(false);

    if (!response.ok) {
      const message = payload.error ?? "Payment failed.";
      setStatus(message);
      if (initialEmbedded) {
        postToParent({ type: "custom_element_error_response", error: { description: message } });
      }
      return;
    }

    setStatus("Payment succeeded.");
    if (initialEmbedded) {
      postToParent({
        type: "custom_element_success_response",
        // Prefer the real Tilled charge id; fall back to payment intent id or our transaction id.
        chargeId: payload.chargeId ?? payload.tilled_payment_id ?? payload.transactionId,
      });
    }
  }

  useEffect(() => {
    submitPaymentRef.current = submitPayment;
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPayment();
  }

  // ── Auto-submit when saved method is available (embedded mode only) ──────────

  useEffect(() => {
    if (!initialEmbedded || hasAutoSubmitted || isSubmitting || !canSubmit) return;
    if (!paymentMethodId && !paymentToken) return;

    queueMicrotask(() => {
      setHasAutoSubmitted(true);
      void submitPaymentRef.current?.();
    });
  }, [canSubmit, hasAutoSubmitted, initialEmbedded, isSubmitting, paymentMethodId, paymentToken]);

  const handleCardFormReady = useCallback((ready: boolean) => {
    setCardFormReady(ready);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  // Embedded: show spinner until payment_initiate_props arrives.
  if (initialEmbedded && !hasReceivedProps) {
    return (
      <main style={{ maxWidth: "520px", margin: "40px auto", padding: "24px" }}>
        <section
          style={{
            background: "#fff",
            borderRadius: "18px",
            padding: "32px",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#6b7280", margin: 0 }}>
            {propsTimeout ? "Waiting for invoice details from HighLevel…" : "Preparing payment…"}
          </p>
          {propsTimeout ? (
            <p style={{ color: "#dc2626", margin: "12px 0 0", fontSize: "14px" }}>
              Payment details were not received. Confirm your Payments URL uses{" "}
              <code>?embedded=agencycrm</code> and that this location has a publishable key
              configured in the Swypit integration.
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "520px", margin: "40px auto", padding: "24px" }}>
      <section
        style={{
          background: "#fff",
          borderRadius: "18px",
          padding: "28px",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
        }}
      >
        {!initialEmbedded && (
          <h1 style={{ marginTop: 0, fontSize: "20px", fontWeight: 700 }}>Swypit Checkout</h1>
        )}

        {/* Required-field error (embedded, after props received) */}
        {missingFields ? (
          <p style={{ color: "#dc2626", margin: 0 }}>
            Unable to start payment: missing {missingFields.join(", ")}.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Amount + description summary */}
            <div style={{ marginBottom: "20px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "30px",
                  fontWeight: 700,
                  color: "#111827",
                  letterSpacing: "-0.5px",
                }}
              >
                {formatAmount(paymentProps.currency, paymentProps.amount)}
              </p>
              {paymentProps.description ? (
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#6b7280" }}>
                  {paymentProps.description}
                </p>
              ) : null}
            </div>

            {/* Debug / standalone fields */}
            {showDebugFields ? (
              <>
                <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                  <label style={labelStyle}>Amount</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentProps.amount}
                    onChange={(e) =>
                      setPaymentProps({ ...paymentProps, amount: Number(e.target.value || "0") })
                    }
                    required
                  />
                </div>
                <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                  <label style={labelStyle}>Currency</label>
                  <input
                    style={inputStyle}
                    value={paymentProps.currency}
                    onChange={(e) => setPaymentProps({ ...paymentProps, currency: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                  <label style={labelStyle}>Order ID</label>
                  <input
                    style={inputStyle}
                    value={paymentProps.orderId}
                    onChange={(e) => setPaymentProps({ ...paymentProps, orderId: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                  <label style={labelStyle}>Contact / Customer ID</label>
                  <input
                    style={inputStyle}
                    value={paymentProps.customerId}
                    onChange={(e) =>
                      setPaymentProps({ ...paymentProps, customerId: e.target.value })
                    }
                    required
                  />
                </div>
                <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                  <label style={labelStyle}>Location ID</label>
                  <input
                    style={inputStyle}
                    value={paymentProps.locationId}
                    onChange={(e) =>
                      setPaymentProps({ ...paymentProps, locationId: e.target.value })
                    }
                    required
                  />
                </div>
                <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                  <label style={labelStyle}>Saved Payment Method ID</label>
                  <input
                    style={inputStyle}
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                  />
                </div>
                <div style={{ display: "grid", gap: "6px", marginBottom: "16px" }}>
                  <label style={labelStyle}>Client-side Token</label>
                  <input
                    style={inputStyle}
                    value={paymentToken}
                    onChange={(e) => setPaymentToken(e.target.value)}
                  />
                </div>
              </>
            ) : null}

            {/* Tilled hosted card fields (new card entry) */}
            {showCardForm && tilledConfig ? (
              <div style={{ marginBottom: "20px" }}>
                <TilledCardForm
                  ref={cardFormRef}
                  publishableKey={tilledConfig.publishableKey}
                  merchantAccountId={tilledConfig.merchantAccountId}
                  sandbox={tilledConfig.sandbox}
                  onReady={handleCardFormReady}
                />
              </div>
            ) : null}

            {/* Loading state: config fetch in progress, no saved method, no debug fields */}
            {!showCardForm &&
            !paymentMethodId &&
            !paymentToken &&
            !showDebugFields &&
            paymentProps.locationId &&
            tilledConfig === null ? (
              <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 16px" }}>
                Loading payment form…
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              style={{
                padding: "14px 24px",
                borderRadius: "999px",
                border: 0,
                background: canSubmit && !isSubmitting ? "#111827" : "#9ca3af",
                color: "#fff",
                cursor: canSubmit && !isSubmitting ? "pointer" : "not-allowed",
                fontSize: "16px",
                fontWeight: 600,
                width: "100%",
                transition: "background 0.2s",
              }}
            >
              {isSubmitting
                ? "Processing…"
                : `Pay ${formatAmount(paymentProps.currency, paymentProps.amount)}`}
            </button>
          </form>
        )}

        {status ? (
          <p
            style={{
              margin: "16px 0 0",
              fontSize: "14px",
              color: status.includes("succeeded") ? "#16a34a" : "#dc2626",
            }}
          >
            {status}
          </p>
        ) : null}
      </section>
    </main>
  );
}
