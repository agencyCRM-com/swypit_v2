"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

// ── Tilled.js SDK type surface (subset used here) ──────────────────────────────

type TilledFieldElement = {
  inject: (selector: string | HTMLElement) => Promise<void>;
};

type TilledForm = {
  createField: (type: "cardNumber" | "cardExpiry" | "cardCvv") => TilledFieldElement;
  teardown: () => void;
};

type CreatePaymentMethodResult = {
  paymentMethod?: { id: string };
  error?: { message: string };
};

type TilledInstance = {
  form: (options: { payment_method_type: "card" }) => Promise<TilledForm>;
  createPaymentMethod: (params: {
    type: "card";
    billing_details: { name: string };
  }) => Promise<CreatePaymentMethodResult>;
};

declare global {
  interface Window {
    Tilled?: new (
      publishableKey: string,
      accountId: string,
      options: { sandbox: boolean },
    ) => TilledInstance;
  }
}

const TILLED_SDK_URL = "https://js.tilled.com/v2";

// ── Component contract ─────────────────────────────────────────────────────────

export type TilledCardFormHandle = {
  /** Tokenizes the entered card details. Returns a Tilled payment method id. */
  tokenize: () => Promise<string>;
};

type TilledCardFormProps = {
  publishableKey: string;
  merchantAccountId: string;
  sandbox: boolean;
  /** Called when the hosted fields finish mounting (ready=true) or are torn down (ready=false). */
  onReady: (ready: boolean) => void;
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const hostedFieldStyle: React.CSSProperties = {
  height: "44px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  padding: "0 12px",
  boxSizing: "border-box",
  background: "#fff",
  overflow: "hidden",
};

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  width: "100%",
  boxSizing: "border-box",
  fontSize: "14px",
};

function waitForTilledSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Tilled.js can only load in the browser."));
  }

  if (window.Tilled) {
    return Promise.resolve();
  }

  const existing = document.getElementById("tilled-js-sdk") as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Tilled.js SDK.")),
        { once: true },
      );
      window.setTimeout(() => {
        if (window.Tilled) resolve();
      }, 50);
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "tilled-js-sdk";
    script.src = TILLED_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Tilled.js SDK."));
    document.head.appendChild(script);
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export const TilledCardForm = forwardRef<TilledCardFormHandle, TilledCardFormProps>(
  function TilledCardForm({ publishableKey, merchantAccountId, sandbox, onReady }, ref) {
    const tilledRef = useRef<TilledInstance | null>(null);
    const tilledFormRef = useRef<TilledForm | null>(null);
    const [cardholderName, setCardholderName] = useState("");
    const [initError, setInitError] = useState<string | null>(null);
    const fieldIdPrefix = useId().replace(/:/g, "");

    const cardNumberRef = useRef<HTMLDivElement>(null);
    const cardExpiryRef = useRef<HTMLDivElement>(null);
    const cardCvvRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      async tokenize() {
        if (!tilledRef.current) {
          throw new Error(
            initError ?? "Payment form is not ready. Please wait and try again.",
          );
        }
        const name = cardholderName.trim() || "Card Holder";
        const result = await tilledRef.current.createPaymentMethod({
          type: "card",
          billing_details: { name },
        });
        if (result.error || !result.paymentMethod) {
          throw new Error(result.error?.message ?? "Card tokenization failed.");
        }
        return result.paymentMethod.id;
      },
    }));

    const onReadyRef = useRef(onReady);

    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      if (!publishableKey || !merchantAccountId) {
        onReadyRef.current(false);
        return;
      }

      let active = true;

      async function init() {
        setInitError(null);
        onReadyRef.current(false);

        try {
          await waitForTilledSdk();
          if (!active || !window.Tilled) {
            throw new Error("Tilled.js SDK did not initialize.");
          }

          const numberEl = cardNumberRef.current;
          const expiryEl = cardExpiryRef.current;
          const cvvEl = cardCvvRef.current;
          if (!numberEl || !expiryEl || !cvvEl) {
            throw new Error("Card field containers are not mounted.");
          }

          tilledFormRef.current?.teardown();
          tilledFormRef.current = null;
          tilledRef.current = null;

          numberEl.innerHTML = "";
          expiryEl.innerHTML = "";
          cvvEl.innerHTML = "";

          const tilled = new window.Tilled(publishableKey, merchantAccountId, { sandbox });
          tilledRef.current = tilled;

          const form = await tilled.form({ payment_method_type: "card" });
          if (!active) {
            form.teardown();
            return;
          }
          tilledFormRef.current = form;

          const cardNumber = form.createField("cardNumber");
          const cardExpiry = form.createField("cardExpiry");
          const cardCvv = form.createField("cardCvv");

          await cardNumber.inject(numberEl);
          await cardExpiry.inject(expiryEl);
          await cardCvv.inject(cvvEl);

          if (active) onReadyRef.current(true);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to load secure card fields.";
          if (active) {
            setInitError(message);
            onReadyRef.current(false);
          }
        }
      }

      void init();

      return () => {
        active = false;
        tilledFormRef.current?.teardown();
        tilledFormRef.current = null;
        tilledRef.current = null;
        onReadyRef.current(false);
      };
    }, [publishableKey, merchantAccountId, sandbox]);

    return (
      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <label style={labelStyle} htmlFor={`${fieldIdPrefix}-cardholder`}>
            Cardholder Name
          </label>
          <input
            id={`${fieldIdPrefix}-cardholder`}
            style={inputStyle}
            placeholder="Full name on card"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            autoComplete="cc-name"
          />
        </div>

        <div style={{ display: "grid", gap: "6px" }}>
          <label style={labelStyle}>Card Number</label>
          <div ref={cardNumberRef} style={hostedFieldStyle} />
        </div>

        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <label style={labelStyle}>Expiry</label>
            <div ref={cardExpiryRef} style={hostedFieldStyle} />
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            <label style={labelStyle}>CVV</label>
            <div ref={cardCvvRef} style={hostedFieldStyle} />
          </div>
        </div>

        {initError ? (
          <p style={{ margin: 0, fontSize: "14px", color: "#dc2626" }}>{initError}</p>
        ) : null}
      </div>
    );
  },
);
