-- Migration 002: Create Role Profiles Table
-- ═══════════════════════════════════════════════════════════
-- Dynamic RBAC system. Each tenant defines their own roles with granular permissions.

CREATE TABLE role_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_name       VARCHAR(100) NOT NULL,
    is_system_role  BOOLEAN DEFAULT false,  -- System roles (Admin, Member) cannot be deleted
    permissions     JSONB NOT NULL DEFAULT '{}',  -- Dynamic permission matrix
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Each tenant can have only one role with a given name
    UNIQUE(tenant_id, role_name)
);

-- Index for tenant-scoped queries
CREATE INDEX idx_role_profiles_tenant_id ON role_profiles(tenant_id);

-- GIN index for JSONB permission lookups
CREATE INDEX idx_role_profiles_permissions ON role_profiles USING GIN(permissions);

-- Comment: Example permissions structure
-- {
--   "leads":    { "create": true,  "read": true, "update": true,  "delete": false },
--   "contacts": { "create": true,  "read": true, "update": true,  "delete": false },
--   "deals":    { "create": true,  "read": true, "update": false, "delete": false },
--   "reports":  { "create": false, "read": true, "update": false, "delete": false },
--   "settings": { "create": false, "read": false,"update": false, "delete": false }
-- }
