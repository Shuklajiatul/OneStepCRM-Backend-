-- Migration 009: Create Deals Table
-- ═══════════════════════════════════════════════════════════
-- Deals linked to contacts, companies, and pipelines.
-- Note: pipeline_id and stage_id FKs are added in migration 010.

CREATE TABLE deals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id            UUID NOT NULL REFERENCES users(id),
    title               VARCHAR(255) NOT NULL,
    contact_id          UUID REFERENCES contacts(id),
    company_id          UUID REFERENCES companies(id),
    pipeline_id         UUID,  -- FK added after pipelines table created
    stage_id            UUID,  -- FK added after pipeline_stages table created
    deal_value          NUMERIC(15,2),
    currency            VARCHAR(3) DEFAULT 'USD',
    probability         INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    expected_close_date DATE,
    closed_at           TIMESTAMPTZ,
    status              VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
    lost_reason         TEXT,
    custom_properties   JSONB DEFAULT '{}',
    tags                TEXT[] DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ  -- Soft delete
);

-- Tenant isolation
CREATE INDEX idx_deals_tenant_id ON deals(tenant_id);

-- Owner filtering
CREATE INDEX idx_deals_owner_id ON deals(tenant_id, owner_id);

-- Pipeline + stage filtering
CREATE INDEX idx_deals_pipeline ON deals(tenant_id, pipeline_id);
CREATE INDEX idx_deals_stage ON deals(tenant_id, stage_id);

-- Status filtering
CREATE INDEX idx_deals_status ON deals(tenant_id, status);

-- Contact/company linkage
CREATE INDEX idx_deals_contact_id ON deals(contact_id);
CREATE INDEX idx_deals_company_id ON deals(company_id);

-- Date range queries
CREATE INDEX idx_deals_expected_close ON deals(tenant_id, expected_close_date);
CREATE INDEX idx_deals_created_at ON deals(tenant_id, created_at DESC);

-- GIN indexes
CREATE INDEX idx_deals_custom_properties ON deals USING GIN(custom_properties);
CREATE INDEX idx_deals_tags ON deals USING GIN(tags);

-- Soft delete filter
CREATE INDEX idx_deals_not_deleted ON deals(tenant_id) WHERE deleted_at IS NULL;
