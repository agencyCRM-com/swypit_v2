# Swypit GHL Payment Provider

Practice implementation of a private multi-location GoHighLevel custom payment provider powered by Tilled and hosted on Vercel with Next.js.

## Stack

- Next.js App Router and Route Handlers
- TypeScript
- Supabase Postgres via `@supabase/supabase-js`
- Tilled REST API for payment intents, refunds, and webhooks

## What This App Includes

- GHL OAuth install callback and token persistence
- Provider registration and config sync back to GHL
- Embedded Tilled config page for each location
- GHL query dispatcher for verify, refund, and saved-method charging
- Direct charge endpoint and minimal standalone checkout page
- Tilled webhook verification and payment/refund mapping persistence

## Environment Setup

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_APP_URL`
- `GHL_CLIENT_ID`
- `GHL_CLIENT_SECRET`
- `GHL_APP_ID`
- `GHL_APP_NAME`
- `GHL_BASE_URL`
- `GHL_MARKETPLACE_BASE_URL`
- `GHL_REDIRECT_URI`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_SECRET`
- `TILLED_BASE_URL`
- `TILLED_WEBHOOK_TOLERANCE_SECONDS`

Use a long random value for `ENCRYPTION_SECRET`. Tilled secrets and webhook secrets are encrypted before being stored in Supabase.

## Supabase Schema

Run the SQL in `supabase/migrations/0001_init.sql`.

Core tables:

- `ghl_location_tokens`
- `tilled_location_configs`
- `ghl_order_payments`
- `ghl_transaction_refunds`
- `integration_event_log`

## Local Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
```

## Key Routes

- Home: `/`
- Embedded config page: `/ghl/config/tilled?locationId=...`
- OAuth install helper: `POST /api/ghl/oauth/install`
- OAuth callback: `GET /api/ghl/oauth/callback`
- Token fetch: `GET /api/ghl/oauth/token/:locationId`
- Tilled config API: `GET|POST /api/ghl/config/tilled`
- Main GHL query URL: `POST /api/ghl/query`
- Verify wrapper: `POST /api/ghl/query/verify`
- Refund wrapper: `POST /api/ghl/query/refund`
- Charge route: `POST /api/ghl/payment/charge`
- Standalone checkout API: `POST /api/tilled/checkout`
- Tilled webhook: `POST /api/webhooks/tilled`

## GHL Marketplace Notes

Use these values in your GHL marketplace app:

- Redirect URL: `https://your-domain/api/ghl/oauth/callback`
- Query URL: `https://your-domain/api/ghl/query`
- Payments URL: `https://your-domain/checkout?embedded=ghl`
- Custom config page: `https://your-domain/ghl/config/tilled`

Required scopes should include the payments custom-provider, orders, transactions, and product scopes from the GHL payments docs.

## Current Practice-Build Constraints

- One-time charges and refunds are implemented.
- Saved-method charging is supported when GHL sends a usable payment method id.
- Recurring capability is intentionally returned as disabled for now.
- The standalone checkout page is minimal and expects a saved payment method id or a client-side token that your frontend can exchange to a Tilled payment method.
- Some GHL custom-provider request bodies are only lightly documented publicly, so the query dispatcher is defensive and logs inbound events for easier debugging.

## Recommended Next Steps

- Replace the minimal token entry field with real Tilled Payments.js collection.
- Add authenticated GHL custom-page SSO verification if you want tighter embedded-page access control.
- Expand recurring/subscription support if your GHL provider needs recurring capability.
