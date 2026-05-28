-- Migration 008: Create Companies Table
-- ═══════════════════════════════════════════════════════════
-- Company records with address JSONB and custom properties.

CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id            UUID NOT NULL REFERENCES users(id),
    name                VARCHAR(255) NOT NULL,
    website             TEXT,
    industry            VARCHAR(100),
    company_size        VARCHAR(50) CHECK (company_size IN ('1-10', '11-50', '51-200', '200+')),
    annual_revenue      NUMERIC(15,2),
    employee_count      INTEGER,
    billing_address     JSONB,   -- { street, city, state, country, zip }
    shipping_address    JSONB,   -- { street, city, state, country, zip }
    custom_properties   JSONB DEFAULT '{}',
    tags                TEXT[] DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ  -- Soft delete
);

-- Tenant isolation
CREATE INDEX idx_companies_tenant_id ON companies(tenant_id);

-- Owner filtering
CREATE INDEX idx_companies_owner_id ON companies(tenant_id, owner_id);

-- Industry filtering
CREATE INDEX idx_companies_industry ON companies(tenant_id, industry);

-- Date sorting
CREATE INDEX idx_companies_created_at ON companies(tenant_id, created_at DESC);

-- GIN indexes
CREATE INDEX idx_companies_custom_properties ON companies USING GIN(custom_properties);
CREATE INDEX idx_companies_tags ON companies USING GIN(tags);

-- Soft delete filter
CREATE INDEX idx_companies_not_deleted ON companies(tenant_id) WHERE deleted_at IS NULL;

-- Full-text search
CREATE INDEX idx_companies_search ON companies USING GIN(
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(website, '') || ' ' || COALESCE(industry, ''))
);

-- Now add the FK from contacts to companies
ALTER TABLE contacts ADD CONSTRAINT fk_contacts_company_id
    FOREIGN KEY (company_id) REFERENCES companies(id);
