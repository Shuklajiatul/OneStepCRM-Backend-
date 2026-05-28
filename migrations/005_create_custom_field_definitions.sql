-- Migration 005: Create Custom Field Definitions Table
-- ═══════════════════════════════════════════════════════════
-- Heart of OneStepCRM flexibility — tenants define their own fields for any module.

CREATE TABLE custom_field_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type     VARCHAR(50) NOT NULL CHECK (entity_type IN ('lead', 'contact', 'company', 'deal')),
    field_key       VARCHAR(100) NOT NULL,  -- snake_case slug: 'annual_revenue'
    field_label     VARCHAR(255) NOT NULL,  -- Display name: 'Annual Revenue'
    field_type      VARCHAR(50) NOT NULL CHECK (field_type IN (
        'text', 'number', 'date', 'dropdown', 'multi_select',
        'checkbox', 'url', 'phone', 'email', 'textarea', 'currency'
    )),
    options         JSONB,  -- For dropdown/multi_select: [{label, value}]
    is_required     BOOLEAN DEFAULT false,
    is_visible      BOOLEAN DEFAULT true,
    display_order   INTEGER DEFAULT 0,  -- For UI ordering
    section_name    VARCHAR(100) DEFAULT 'Details',  -- Groups fields into collapsible sections
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Each tenant+entity can only have one field with a given key
    UNIQUE(tenant_id, entity_type, field_key)
);

-- Index for listing fields by tenant + entity type
CREATE INDEX idx_custom_fields_tenant_entity ON custom_field_definitions(tenant_id, entity_type);

-- GIN index on options for fast dropdown lookups
CREATE INDEX idx_custom_fields_options ON custom_field_definitions USING GIN(options);

-- Index for display ordering
CREATE INDEX idx_custom_fields_order ON custom_field_definitions(tenant_id, entity_type, display_order);
