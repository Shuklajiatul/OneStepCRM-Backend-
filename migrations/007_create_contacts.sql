-- Migration 007: Create Contacts Table
-- ═══════════════════════════════════════════════════════════
-- Contacts — converted from leads or created directly.

CREATE TABLE contacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id            UUID NOT NULL REFERENCES users(id),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100),
    email               VARCHAR(255),
    phone               VARCHAR(50),
    mobile              VARCHAR(50),
    job_title           VARCHAR(255),
    department          VARCHAR(255),
    company_id          UUID,  -- FK added after companies table exists (Migration 008)
    lead_id             UUID REFERENCES leads(id),  -- Set when converted from lead
    lifecycle_stage     VARCHAR(100) DEFAULT 'subscriber' CHECK (lifecycle_stage IN (
        'subscriber', 'lead', 'opportunity', 'customer', 'evangelist'
    )),
    custom_properties   JSONB DEFAULT '{}',
    tags                TEXT[] DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ  -- Soft delete
);

-- Tenant isolation
CREATE INDEX idx_contacts_tenant_id ON contacts(tenant_id);

-- Owner-based filtering
CREATE INDEX idx_contacts_owner_id ON contacts(tenant_id, owner_id);

-- Company linkage
CREATE INDEX idx_contacts_company_id ON contacts(tenant_id, company_id);

-- Lead conversion tracking
CREATE INDEX idx_contacts_lead_id ON contacts(lead_id) WHERE lead_id IS NOT NULL;

-- Lifecycle stage filtering
CREATE INDEX idx_contacts_lifecycle ON contacts(tenant_id, lifecycle_stage);

-- Date sorting
CREATE INDEX idx_contacts_created_at ON contacts(tenant_id, created_at DESC);

-- GIN indexes
CREATE INDEX idx_contacts_custom_properties ON contacts USING GIN(custom_properties);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);

-- Soft delete filter
CREATE INDEX idx_contacts_not_deleted ON contacts(tenant_id) WHERE deleted_at IS NULL;

-- Full-text search
CREATE INDEX idx_contacts_search ON contacts USING GIN(
    to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(job_title, ''))
);
