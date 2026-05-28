-- Migration 006: Create Leads Table
-- ═══════════════════════════════════════════════════════════
-- Core CRM entity — leads with custom_properties JSONB for dynamic fields.

CREATE TABLE leads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id            UUID NOT NULL REFERENCES users(id),
    title               VARCHAR(255) NOT NULL,  -- Lead title/subject
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    email               VARCHAR(255),
    phone               VARCHAR(50),
    company_name        VARCHAR(255),
    lead_source         VARCHAR(100),  -- 'website' | 'referral' | 'cold_call' | 'social' | 'other'
    pipeline_stage      VARCHAR(100) DEFAULT 'new',  -- Stage key from tenant's pipeline config
    priority            VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    estimated_value     NUMERIC(15,2),
    expected_close_date DATE,
    is_converted        BOOLEAN DEFAULT false,
    converted_at        TIMESTAMPTZ,
    converted_by        UUID REFERENCES users(id),
    custom_properties   JSONB DEFAULT '{}',  -- ALL dynamic custom fields stored here
    tags                TEXT[] DEFAULT '{}',  -- Fast tag-based filtering
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ  -- Soft delete
);

-- Tenant isolation — the most critical index
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);

-- Owner-based filtering
CREATE INDEX idx_leads_owner_id ON leads(tenant_id, owner_id);

-- Pipeline stage filtering
CREATE INDEX idx_leads_pipeline_stage ON leads(tenant_id, pipeline_stage);

-- Priority filtering
CREATE INDEX idx_leads_priority ON leads(tenant_id, priority);

-- Date-based sorting/filtering
CREATE INDEX idx_leads_created_at ON leads(tenant_id, created_at DESC);

-- GIN index on custom_properties for JSONB queries
CREATE INDEX idx_leads_custom_properties ON leads USING GIN(custom_properties);

-- GIN index on tags for array overlap queries
CREATE INDEX idx_leads_tags ON leads USING GIN(tags);

-- Soft delete filter — most queries exclude deleted records
CREATE INDEX idx_leads_not_deleted ON leads(tenant_id) WHERE deleted_at IS NULL;

-- Full-text search index
CREATE INDEX idx_leads_search ON leads USING GIN(
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(company_name, ''))
);
