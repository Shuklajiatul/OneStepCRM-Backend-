-- Migration 001: Create Tenants Table
-- ═══════════════════════════════════════════════════════════
-- Core multi-tenancy table. Every record in the system belongs to a tenant.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- For gen_random_uuid()

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name    VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,  -- subdomain routing: acme.onestepcrm.com
    plan            VARCHAR(50) DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'enterprise')),
    max_users       INTEGER DEFAULT 5,
    is_active       BOOLEAN DEFAULT true,
    settings        JSONB DEFAULT '{}',  -- org-level config: logo_url, timezone, currency, date_format
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for slug lookups (login, subdomain routing)
CREATE INDEX idx_tenants_slug ON tenants(slug);

-- Index for active tenant filtering
CREATE INDEX idx_tenants_is_active ON tenants(is_active) WHERE is_active = true;
