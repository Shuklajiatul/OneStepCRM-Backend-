-- Migration 014: Create Webhooks & Webhook Deliveries Tables
-- ═══════════════════════════════════════════════════════════
-- Zapier-style outbound webhook registration and delivery tracking.

CREATE TABLE webhooks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by          UUID NOT NULL REFERENCES users(id),
    name                VARCHAR(255) NOT NULL,
    endpoint_url        TEXT NOT NULL,
    secret_key          VARCHAR(255),  -- For HMAC signature verification
    events              TEXT[] NOT NULL DEFAULT '{}',  -- e.g. ['lead.created', 'deal.won']
    is_active           BOOLEAN DEFAULT true,
    last_triggered_at   TIMESTAMPTZ,
    failure_count       INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);
CREATE INDEX idx_webhooks_active ON webhooks(tenant_id, is_active) WHERE is_active = true;

CREATE TABLE webhook_deliveries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id          UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type          VARCHAR(100) NOT NULL,
    payload             JSONB NOT NULL,
    status              VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    http_status_code    INTEGER,
    response_body       TEXT,
    attempts            INTEGER DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at)
    WHERE status = 'pending';
