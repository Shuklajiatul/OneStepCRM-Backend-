-- Migration 013: Create File Attachments Table
-- ═══════════════════════════════════════════════════════════
-- File attachments linked to any entity (polymorphic).

CREATE TABLE file_attachments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    uploaded_by         UUID NOT NULL REFERENCES users(id),
    entity_type         VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'lead', 'contact', 'company', 'deal'
    )),
    entity_id           UUID NOT NULL,  -- Polymorphic reference
    original_filename   VARCHAR(255) NOT NULL,
    stored_filename     VARCHAR(255) NOT NULL,
    file_path           TEXT NOT NULL,
    file_size_bytes     BIGINT NOT NULL,
    mime_type           VARCHAR(100) NOT NULL,
    is_public           BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant isolation
CREATE INDEX idx_files_tenant_id ON file_attachments(tenant_id);

-- Entity-based file listing
CREATE INDEX idx_files_entity ON file_attachments(tenant_id, entity_type, entity_id);

-- Uploader filtering
CREATE INDEX idx_files_uploaded_by ON file_attachments(uploaded_by);
