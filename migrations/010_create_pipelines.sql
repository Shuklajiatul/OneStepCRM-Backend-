-- Migration 010: Create Pipelines & Pipeline Stages Tables
-- ═══════════════════════════════════════════════════════════
-- Tenant-configurable pipelines with ordered stages.

CREATE TABLE pipelines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    entity_type     VARCHAR(50) NOT NULL CHECK (entity_type IN ('lead', 'deal')),
    is_default      BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Only one default pipeline per tenant per entity type
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_pipelines_tenant_id ON pipelines(tenant_id);
CREATE INDEX idx_pipelines_entity_type ON pipelines(tenant_id, entity_type);

CREATE TABLE pipeline_stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    order_index     INTEGER NOT NULL DEFAULT 0,
    probability     INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    color           VARCHAR(7) DEFAULT '#6366f1',  -- Hex color for UI
    is_won_stage    BOOLEAN DEFAULT false,
    is_lost_stage   BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
CREATE INDEX idx_pipeline_stages_tenant ON pipeline_stages(tenant_id);
CREATE INDEX idx_pipeline_stages_order ON pipeline_stages(pipeline_id, order_index);

-- Now add the FKs from deals to pipelines and pipeline_stages
ALTER TABLE deals ADD CONSTRAINT fk_deals_pipeline_id
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id);

ALTER TABLE deals ADD CONSTRAINT fk_deals_stage_id
    FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id);
