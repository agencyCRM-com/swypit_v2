-- Speed up webhook idempotency check: hasIntegrationEvent looks up by source + external_id.
create index if not exists idx_integration_event_log_source_external_id
  on swypit_ghl.integration_event_log (source, external_id)
  where external_id is not null;

-- Speed up payment lookups used in charge idempotency and refund resolution.
create index if not exists idx_ghl_order_payments_status
  on swypit_ghl.ghl_order_payments (status);

create index if not exists idx_ghl_order_payments_transaction_id
  on swypit_ghl.ghl_order_payments (ghl_transaction_id)
  where ghl_transaction_id is not null;

  --

-- Speed up Tilled config lookups during webhook dispatch.
create index if not exists idx_tilled_location_configs_provider_api_key
  on swypit_ghl.tilled_location_configs (provider_api_key);
