create table if not exists swypit_ghl.ghl_location_tokens (
  location_id text primary key,
  company_id text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  installed_at timestamptz not null default now()
);

create table if not exists swypit_ghl.tilled_location_configs (
  location_id text primary key,
  mode text not null check (mode in ('test', 'live')),
  merchant_account_id text not null unique,
  provider_api_key text not null unique,
  test_secret_key_encrypted text not null,
  live_secret_key_encrypted text not null,
  webhook_secret_encrypted text,
  publishable_key text,
  verify_status text,
  updated_at timestamptz not null default now()
);

create table if not exists swypit_ghl.ghl_order_payments (
  ghl_order_id text primary key,
  ghl_transaction_id text unique,
  location_id text not null references swypit_ghl.tilled_location_configs (location_id) on delete cascade,
  tilled_payment_intent_id text not null unique,
  tilled_charge_id text unique,
  status text not null,
  amount numeric(12, 2) not null,
  currency text not null,
  created_at timestamptz not null default now()
);

create table if not exists swypit_ghl.ghl_transaction_refunds (
  id bigint generated always as identity primary key,
  ghl_transaction_id text not null,
  location_id text not null references swypit_ghl.tilled_location_configs (location_id) on delete cascade,
  tilled_refund_id text not null,
  amount numeric(12, 2) not null,
  currency text not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (ghl_transaction_id, tilled_refund_id)
);

create table if not exists swypit_ghl.integration_event_log (
  id bigint generated always as identity primary key,
  source text not null,
  event_type text not null,
  external_id text,
  location_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
