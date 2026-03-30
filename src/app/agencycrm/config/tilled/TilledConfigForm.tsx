"use client";

import { useEffect, useMemo, useState } from "react";

type ConfigResponse = {
  locationId: string;
  mode: "test" | "live";
  tilled_merchant_account_id: string;
  tilled_test_secret_key: string;
  tilled_live_secret_key: string;
  tilled_publishable_key?: string;
  tilled_webhook_secret?: string;
  verify_status?: string | null;
};

const fieldStyle = {
  display: "grid",
  gap: "8px",
  marginBottom: "16px",
};

const inputStyle = {
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
};

export function TilledConfigForm({ initialLocationId }: { initialLocationId: string }) {
  const [form, setForm] = useState<ConfigResponse>({
    locationId: initialLocationId,
    mode: "test",
    tilled_merchant_account_id: "",
    tilled_test_secret_key: "",
    tilled_live_secret_key: "",
    tilled_publishable_key: "",
    tilled_webhook_secret: "",
  });
  const [status, setStatus] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialLocationId) {
      return;
    }

    async function loadConfig() {
      const response = await fetch(
        `/api/agencycrm/config/tilled?locationId=${encodeURIComponent(initialLocationId)}`,
      );
      const payload = (await response.json()) as ConfigResponse & { error?: string };

      if (!response.ok) {
        setStatus(payload.error ?? "Unable to load existing config.");
        return;
      }

      setForm((current) => ({
        ...current,
        ...payload,
        locationId: initialLocationId,
      }));
    }

    void loadConfig();
  }, [initialLocationId]);

  const canSubmit = useMemo(() => {
    return Boolean(
      form.locationId &&
        form.tilled_merchant_account_id &&
        form.tilled_test_secret_key &&
        form.tilled_live_secret_key,
    );
  }, [form]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    const response = await fetch("/api/agencycrm/config/tilled", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...form,
        verify: true,
      }),
    });

    const payload = (await response.json()) as { message?: string; error?: string };

    setIsSubmitting(false);
    setStatus(payload.message ?? payload.error ?? "Config saved.");
  }

  return (
    <main style={{ maxWidth: "680px", margin: "40px auto", padding: "24px" }}>
      <section
        style={{
          background: "#fff",
          borderRadius: "18px",
          padding: "24px",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Tilled Gateway Configuration</h1>
        <p>Save Tilled credentials for this Agency CRM location and verify the active mode before enabling it.</p>

        <form onSubmit={handleSubmit}>
          <label style={fieldStyle}>
            <span>Location ID</span>
            <input
              style={inputStyle}
              value={form.locationId}
              onChange={(event) => setForm({ ...form, locationId: event.target.value })}
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Tilled Test Secret Key</span>
            <input
              style={inputStyle}
              type="password"
              value={form.tilled_test_secret_key}
              onChange={(event) => setForm({ ...form, tilled_test_secret_key: event.target.value })}
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Tilled Live Secret Key</span>
            <input
              style={inputStyle}
              type="password"
              value={form.tilled_live_secret_key}
              onChange={(event) => setForm({ ...form, tilled_live_secret_key: event.target.value })}
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Tilled Merchant Account ID</span>
            <input
              style={inputStyle}
              value={form.tilled_merchant_account_id}
              onChange={(event) => setForm({ ...form, tilled_merchant_account_id: event.target.value })}
              required
            />
          </label>

          <label style={fieldStyle}>
            <span>Mode</span>
            <select
              style={inputStyle}
              value={form.mode}
              onChange={(event) => setForm({ ...form, mode: event.target.value as "test" | "live" })}
            >
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </label>

          <label style={fieldStyle}>
            <span>Tilled Publishable Key (optional)</span>
            <input
              style={inputStyle}
              value={form.tilled_publishable_key ?? ""}
              onChange={(event) => setForm({ ...form, tilled_publishable_key: event.target.value })}
            />
          </label>

          <label style={fieldStyle}>
            <span>Tilled Webhook Secret (optional)</span>
            <input
              style={inputStyle}
              type="password"
              value={form.tilled_webhook_secret ?? ""}
              onChange={(event) => setForm({ ...form, tilled_webhook_secret: event.target.value })}
            />
          </label>

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
            {isSubmitting ? "Saving..." : "Save and Verify"}
          </button>
        </form>

        {status ? (
          <p
            style={{
              marginBottom: 0,
              marginTop: "16px",
              color: status.toLowerCase().includes("error") ? "#b91c1c" : "#166534",
            }}
          >
            {status}
          </p>
        ) : null}
      </section>
    </main>
  );
}
