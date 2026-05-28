/**
 * modules/customFields/customFields.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Custom Field Definitions.
 */

const db = require('../../config/database');

/**
 * List all custom field definitions for a tenant, optionally filtered by entity type.
 */
async function listDefinitions(tenantId, entityType = null) {
  let query = `
    SELECT id, tenant_id, entity_type, field_key, field_label, field_type,
           options, is_required, is_visible, display_order, section_name,
           created_at, updated_at
    FROM custom_field_definitions
    WHERE tenant_id = $1
  `;
  const params = [tenantId];

  if (entityType) {
    query += ` AND entity_type = $2`;
    params.push(entityType);
  }

  query += ` ORDER BY entity_type ASC, display_order ASC, created_at ASC`;

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Get a single custom field definition by ID.
 */
async function getDefinitionById(tenantId, id) {
  const result = await db.query(
    `SELECT id, tenant_id, entity_type, field_key, field_label, field_type,
            options, is_required, is_visible, display_order, section_name,
            created_at, updated_at
     FROM custom_field_definitions
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Check if a field key already exists for a tenant and entity type.
 */
async function existsByKey(tenantId, entityType, fieldKey) {
  const result = await db.query(
    `SELECT 1 FROM custom_field_definitions
     WHERE tenant_id = $1 AND entity_type = $2 AND field_key = $3`,
    [tenantId, entityType, fieldKey]
  );
  return result.rows.length > 0;
}

/**
 * Create a new custom field definition.
 */
async function createDefinition(tenantId, { entityType, fieldKey, fieldLabel, fieldType, options, isRequired, isVisible, displayOrder, sectionName }) {
  const result = await db.query(
    `INSERT INTO custom_field_definitions
       (tenant_id, entity_type, field_key, field_label, field_type, options, is_required, is_visible, display_order, section_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      tenantId,
      entityType,
      fieldKey,
      fieldLabel,
      fieldType,
      options ? JSON.stringify(options) : null,
      isRequired ?? false,
      isVisible ?? true,
      displayOrder ?? 0,
      sectionName || 'Details'
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing custom field definition.
 */
async function updateDefinition(tenantId, id, updates) {
  const allowedFields = ['field_label', 'options', 'is_required', 'is_visible', 'display_order', 'section_name'];
  const setClauses = [];
  const params = [tenantId, id];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      const dbKey = key; // Keep original snake_case, or map if we pass camelCase.
      setClauses.push(`${dbKey} = $${paramIndex}`);
      if (key === 'options') {
        params.push(value ? JSON.stringify(value) : null);
      } else {
        params.push(value);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE custom_field_definitions
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Delete a custom field definition.
 */
async function deleteDefinition(tenantId, id) {
  const result = await db.query(
    'DELETE FROM custom_field_definitions WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listDefinitions,
  getDefinitionById,
  existsByKey,
  createDefinition,
  updateDefinition,
  deleteDefinition
};
