-- Migration 012: Create Audit Logs Table
-- ═══════════════════════════════════════════════════════════
-- Immutable audit trail for compliance. Uses BIGSERIAL for high-volume inserts.
-- Partitioned by month for query performance.

CREATE TABLE audit_logs (
    id              BIGSERIAL,
    tenant_id       UUID NOT NULL,
    user_id         UUID,
    action          VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID,
    changes         JSONB,  -- { before: {}, after: {} } diff
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()  -- NO updated_at — audit logs are immutable
) PARTITION BY RANGE (created_at);

-- Create initial partitions for the current and next 3 months
-- In production, a cron job should create future partitions automatically.
DO $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..3 LOOP
        start_date := date_trunc('month', CURRENT_DATE) + (i || ' months')::interval;
        end_date := start_date + '1 month'::interval;
        partition_name := 'audit_logs_' || to_char(start_date, 'YYYY_MM');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
    END LOOP;
END $$;

-- Indexes on the partitioned table
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(tenant_id, entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(tenant_id, user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(tenant_id, action);
