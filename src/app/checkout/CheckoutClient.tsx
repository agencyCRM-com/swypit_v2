"use client";

import { useEffect, useMemo, useState } from "react";

type PaymentProps = {
  amount: number;
  currency: string;
  description: string;
  orderId: string;
  locationId: string;
  customerId: string;
  transactionId?: string;
};

type ParentMessage =
  | {
      type: "payment_initiate_props";
      amount: number;
      currency: string;
      orderId: string;
      locationId: string;
      transactionId?: string;
      contact?: { id?: string };
    }
  | {
      type: "setup_initiate_props";
      locationId: string;
      contact?: { id?: string };
    };

const inputStyle = {
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
};

export function CheckoutClient({
  initialEmbedded,
  initialPaymentProps,
}: {
  initialEmbedded: boolean;
  initialPaymentProps: PaymentProps;
}) {
  const [paymentProps, setPaymentProps] = useState<PaymentProps>(initialPaymentProps);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentToken, setPaymentToken] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialEmbedded || typeof window === "undefined") {
      return;
    }

    window.parent.postMessage(
      {
        type: "custom_provider_ready",
        loaded: true,
        addCardOnFileSupported: true,
      },
      "*",
    );

    const onMessage = (event: MessageEvent<ParentMessage>) => {
      if (event.data.type === "payment_initiate_props") {
        setPaymentProps({
          amount: event.data.amount,
          currency: event.data.currency,
          description: "GHL payment",
          orderId: event.data.orderId,
          locationId: event.data.locationId,
          customerId: event.data.contact?.id ?? "",
          transactionId: event.data.transactionId,
        });
      }

      if (event.data.type === "setup_initiate_props") {
        setPaymentProps((current) => ({
          ...current,
          locationId: event.data.locationId,
          customerId: event.data.contact?.id ?? "",
        }));
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [initialEmbedded]);

  const canSubmit = useMemo(() => {
    return Boolean(
      paymentProps.locationId &&
        paymentProps.orderId &&
        paymentProps.customerId &&
        paymentProps.amount > 0 &&
        (paymentMethodId || paymentToken),
    );
  }, [paymentMethodId, paymentProps, paymentToken]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    const response = await fetch("/api/tilled/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...paymentProps,
        action: "capture",
        paymentMethod: paymentMethodId ? { id: paymentMethodId, type: "card" } : undefined,
        paymentToken: paymentToken || undefined,
      }),
    });

    const payload = (await response.json()) as { error?: string; tilled_payment_id?: string; transactionId?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      const message = payload.error ?? "Payment failed.";
      setStatus(message);
      if (initialEmbedded && typeof window !== "undefined") {
        window.parent.postMessage(
          {
            type: "custom_element_error_response",
            error: { description: message },
          },
          "*",
        );
      }

      return;
    }

    setStatus("Payment succeeded.");
    if (initialEmbedded && typeof window !== "undefined") {
      window.parent.postMessage(
        {
          type: "custom_element_success_response",
          chargeId: payload.tilled_payment_id ?? payload.transactionId,
        },
        "*",
      );
    }
  }

  return (
    <main style={{ maxWidth: "640px", margin: "40px auto", padding: "24px" }}>
      <section
        style={{
          background: "#fff",
          borderRadius: "18px",
          padding: "24px",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>{initialEmbedded ? "Embedded GHL Checkout" : "Standalone Checkout"}</h1>
        <p>
          This minimal practice page expects a saved Tilled payment method id or a client-generated token
          that your frontend can exchange for a Tilled payment method.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
            <span>Amount</span>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="0.01"
              value={paymentProps.amount}
              onChange={(event) =>
                setPaymentProps({ ...paymentProps, amount: Number(event.target.value || "0") })
              }
              required
            />
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
            <span>Currency</span>
            <input
              style={inputStyle}
              value={paymentProps.currency}
              onChange={(event) => setPaymentProps({ ...paymentProps, currency: event.target.value })}
              required
            />
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
            <span>Order ID</span>
            <input
              style={inputStyle}
              value={paymentProps.orderId}
              onChange={(event) => setPaymentProps({ ...paymentProps, orderId: event.target.value })}
              required
            />
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
            <span>Contact / Customer ID</span>
            <input
              style={inputStyle}
              value={paymentProps.customerId}
              onChange={(event) => setPaymentProps({ ...paymentProps, customerId: event.target.value })}
              required
            />
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
            <span>Location ID</span>
            <input
              style={inputStyle}
              value={paymentProps.locationId}
              onChange={(event) => setPaymentProps({ ...paymentProps, locationId: event.target.value })}
              required
            />
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
            <span>Saved Payment Method ID</span>
            <input
              style={inputStyle}
              value={paymentMethodId}
              onChange={(event) => setPaymentMethodId(event.target.value)}
            />
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
            <span>Client-side Token</span>
            <input style={inputStyle} value={paymentToken} onChange={(event) => setPaymentToken(event.target.value)} />
          </div>

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            style={{
              padding: "12px 18px",
              borderRadius: "999px",
              border: 0,
              background: "#111827",
              color: "#fff",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {isSubmitting ? "Processing..." : "Pay"}
          </button>
        </form>

        {status ? <p style={{ marginBottom: 0, marginTop: "16px" }}>{status}</p> : null}
      </section>
    </main>
  );
}
