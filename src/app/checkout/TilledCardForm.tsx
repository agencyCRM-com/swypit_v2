"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

// ── Tilled.js SDK type surface (subset used here) ──────────────────────────────

type TilledFieldElement = {
  inject: (selector: string) => Promise<void>;
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
    Tilled: new (
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

// ── Component ──────────────────────────────────────────────────────────────────

export const TilledCardForm = forwardRef<TilledCardFormHandle, TilledCardFormProps>(
  function TilledCardForm({ publishableKey, merchantAccountId, sandbox, onReady }, ref) {
    const tilledRef = useRef<TilledInstance | null>(null);
    const tilledFormRef = useRef<TilledForm | null>(null);
    const [cardholderName, setCardholderName] = useState("");

    useImperativeHandle(ref, () => ({
      async tokenize() {
        if (!tilledRef.current) {
          throw new Error("Payment form is not ready. Please wait and try again.");
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

    const stableOnReady = useCallback(onReady, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      let active = true;

      async function loadSdk(): Promise<void> {
        if (document.getElementById("tilled-js-sdk")) return;
        return new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.id = "tilled-js-sdk";
          script.src = TILLED_SDK_URL;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Tilled.js SDK."));
          document.head.appendChild(script);
        });
      }

      async function init() {
        try {
          await loadSdk();
          if (!active || !window.Tilled) return;

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

          await cardNumber.inject("#tilled-field-card-number");
          await cardExpiry.inject("#tilled-field-card-expiry");
          await cardCvv.inject("#tilled-field-card-cvv");

          if (active) stableOnReady(true);
        } catch {
          if (active) stableOnReady(false);
        }
      }

      void init();

      return () => {
        active = false;
        tilledFormRef.current?.teardown();
        tilledFormRef.current = null;
        tilledRef.current = null;
        stableOnReady(false);
      };
    }, [publishableKey, merchantAccountId, sandbox, stableOnReady]);

    return (
      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <label style={labelStyle}>Cardholder Name</label>
          <input
            style={inputStyle}
            placeholder="Full name on card"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            autoComplete="cc-name"
          />
        </div>

        <div style={{ display: "grid", gap: "6px" }}>
          <label style={labelStyle}>Card Number</label>
          <div id="tilled-field-card-number" style={hostedFieldStyle} />
        </div>

        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <label style={labelStyle}>Expiry</label>
            <div id="tilled-field-card-expiry" style={hostedFieldStyle} />
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            <label style={labelStyle}>CVV</label>
            <div id="tilled-field-card-cvv" style={hostedFieldStyle} />
          </div>
        </div>
      </div>
    );
  },
);
