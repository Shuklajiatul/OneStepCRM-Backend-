-- Migration 003: Create Users Table
-- ═══════════════════════════════════════════════════════════
-- Tenant-scoped users with role-based access control.

CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_profile_id         UUID NOT NULL REFERENCES role_profiles(id),
    name                    VARCHAR(255) NOT NULL,
    email                   VARCHAR(255) NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,  -- bcrypt hash, min 12 rounds
    avatar_url              TEXT,
    is_active               BOOLEAN DEFAULT true,
    last_login_at           TIMESTAMPTZ,
    invited_by              UUID REFERENCES users(id),
    invitation_token        VARCHAR(255),  -- For email invite / password reset flow
    invitation_expires_at   TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    -- Email must be unique within a tenant
    UNIQUE(tenant_id, email)
);

-- Index for login queries: find user by email within a tenant
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);

-- Index for tenant-scoped user listing
CREATE INDEX idx_users_tenant_id ON users(tenant_id);

-- Index for role-based queries
CREATE INDEX idx_users_role_profile_id ON users(role_profile_id);

-- Index for invitation token lookups
CREATE INDEX idx_users_invitation_token ON users(invitation_token) WHERE invitation_token IS NOT NULL;

-- Index for active users
CREATE INDEX idx_users_is_active ON users(tenant_id, is_active);
