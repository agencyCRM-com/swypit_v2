const cardStyle = {
  maxWidth: "880px",
  margin: "48px auto",
  padding: "32px",
  background: "#ffffff",
  borderRadius: "16px",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
};

export default function HomePage() {
  return (
    <main style={{ padding: "24px" }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Swypit GHL Custom Payment Provider</h1>
        <p>
          This practice app hosts the OAuth, embedded configuration, checkout, query, charge, refund,
          and webhook endpoints needed for a GoHighLevel custom payment provider backed by Tilled.
        </p>
        <ul>
          <li>
            Embedded config page: <code>/ghl/config/tilled?locationId=...</code>
          </li>
          <li>
            OAuth callback: <code>/api/ghl/oauth/callback</code>
          </li>
          <li>
            GHL query URL: <code>/api/ghl/query</code>
          </li>
          <li>
            Standalone checkout: <code>/checkout?locationId=...&amp;order=...&amp;contact=...</code>
          </li>
        </ul>
      </section>
    </main>
  );
}
