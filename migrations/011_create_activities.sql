-- Migration 011: Create Activities Table
-- ═══════════════════════════════════════════════════════════
-- Universal activity system — polymorphic entity reference.

CREATE TABLE activities (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id                UUID NOT NULL REFERENCES users(id),
    activity_type           VARCHAR(50) NOT NULL CHECK (activity_type IN (
        'note', 'call', 'email', 'meeting', 'task', 'sms', 'whatsapp'
    )),
    entity_type             VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'lead', 'contact', 'company', 'deal'
    )),
    entity_id               UUID NOT NULL,  -- Polymorphic reference to the parent record
    subject                 VARCHAR(255),
    description             TEXT,
    due_date                TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    is_completed            BOOLEAN DEFAULT false,
    call_duration_seconds   INTEGER,  -- For call activities
    call_outcome            VARCHAR(50) CHECK (call_outcome IN (
        'connected', 'no_answer', 'busy', 'left_voicemail'
    )),
    metadata                JSONB DEFAULT '{}',  -- Flexible extra data per activity type
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ  -- Soft delete
);

-- Tenant isolation
CREATE INDEX idx_activities_tenant_id ON activities(tenant_id);

-- Entity timeline lookup — the most common query pattern
CREATE INDEX idx_activities_entity ON activities(tenant_id, entity_type, entity_id, created_at DESC);

-- Owner filtering (my tasks, my activities)
CREATE INDEX idx_activities_owner ON activities(tenant_id, owner_id);

-- Activity type filtering
CREATE INDEX idx_activities_type ON activities(tenant_id, activity_type);

-- Open tasks query
CREATE INDEX idx_activities_open_tasks ON activities(tenant_id, owner_id, is_completed)
    WHERE activity_type = 'task' AND is_completed = false AND deleted_at IS NULL;

-- Due date for task/meeting scheduling
CREATE INDEX idx_activities_due_date ON activities(tenant_id, due_date)
    WHERE due_date IS NOT NULL AND deleted_at IS NULL;

-- Date sorting
CREATE INDEX idx_activities_created_at ON activities(tenant_id, created_at DESC);

-- Soft delete filter
CREATE INDEX idx_activities_not_deleted ON activities(tenant_id) WHERE deleted_at IS NULL;
