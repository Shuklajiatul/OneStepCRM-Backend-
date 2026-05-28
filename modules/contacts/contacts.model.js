/**
 * modules/contacts/contacts.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Contacts.
 */

const db = require('../../config/database');

/**
 * List contacts with search, filters, pagination, and tags.
 */
async function listContacts(tenantId, { limit, offset, search, ownerId, companyId, lifecycleStage, tag, includeDeleted = false }) {
  let whereConditions = ['c.tenant_id = $1'];
  let params = [tenantId];
  let paramIndex = 2;

  if (!includeDeleted) {
    whereConditions.push('c.deleted_at IS NULL');
  }

  if (search) {
    whereConditions.push(`(c.first_name ILIKE $${paramIndex} OR c.last_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex} OR c.job_title ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (ownerId) {
    whereConditions.push(`c.owner_id = $${paramIndex}`);
    params.push(ownerId);
    paramIndex++;
  }

  if (companyId) {
    whereConditions.push(`c.company_id = $${paramIndex}`);
    params.push(companyId);
    paramIndex++;
  }

  if (lifecycleStage) {
    whereConditions.push(`c.lifecycle_stage = $${paramIndex}`);
    params.push(lifecycleStage);
    paramIndex++;
  }

  if (tag) {
    whereConditions.push(`$${paramIndex} = ANY(c.tags)`);
    params.push(tag);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM contacts c WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await db.query(
    `SELECT c.*,
            u.name as owner_name, u.email as owner_email,
            comp.name as company_name
     FROM contacts c
     JOIN users u ON c.owner_id = u.id
     LEFT JOIN companies comp ON c.company_id = comp.id
     WHERE ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { contacts: dataResult.rows, total };
}

/**
 * Get a single contact by ID.
 */
async function getContactById(tenantId, id, includeDeleted = false) {
  let query = `
    SELECT c.*,
            u.name as owner_name, u.email as owner_email,
            comp.name as company_name
    FROM contacts c
    JOIN users u ON c.owner_id = u.id
    LEFT JOIN companies comp ON c.company_id = comp.id
    WHERE c.id = $1 AND c.tenant_id = $2
  `;
  const params = [id, tenantId];

  if (!includeDeleted) {
    query += ' AND c.deleted_at IS NULL';
  }

  const result = await db.query(query, params);
  return result.rows[0] || null;
}

/**
 * Create a new contact.
 */
async function createContact(tenantId, { ownerId, firstName, lastName, email, phone, mobile, jobTitle, department, companyId, leadId, lifecycleStage, customProperties, tags }) {
  const result = await db.query(
    `INSERT INTO contacts
       (tenant_id, owner_id, first_name, last_name, email, phone, mobile, job_title, department, company_id, lead_id, lifecycle_stage, custom_properties, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      tenantId,
      ownerId,
      firstName,
      lastName,
      email,
      phone,
      mobile,
      jobTitle,
      department,
      companyId,
      leadId,
      lifecycleStage || 'subscriber',
      customProperties ? JSON.stringify(customProperties) : '{}',
      tags || []
    ]
  );
  return result.rows[0];
}

/**
 * Update a contact.
 */
async function updateContact(tenantId, id, updates) {
  const allowedFields = [
    'owner_id', 'first_name', 'last_name', 'email', 'phone', 'mobile',
    'job_title', 'department', 'company_id', 'lead_id', 'lifecycle_stage',
    'custom_properties', 'tags'
  ];
  const setClauses = [];
  const params = [tenantId, id];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      if (key === 'custom_properties') {
        params.push(value ? JSON.stringify(value) : '{}');
      } else {
        params.push(value);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE contacts
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Soft delete a contact.
 */
async function deleteContact(tenantId, id) {
  const result = await db.query(
    `UPDATE contacts
     SET deleted_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * Restore a soft-deleted contact.
 */
async function restoreContact(tenantId, id) {
  const result = await db.query(
    `UPDATE contacts
     SET deleted_at = NULL
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL
     RETURNING *`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = {
  listContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  restoreContact
};
