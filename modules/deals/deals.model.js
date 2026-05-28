/**
 * modules/deals/deals.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Deals.
 */

const db = require('../../config/database');

/**
 * List deals with search, filters, pagination, and sorting.
 */
async function listDeals(tenantId, { limit, offset, search, ownerId, pipelineId, stageId, status, tag, contactId, companyId, includeDeleted = false }) {
  let whereConditions = ['d.tenant_id = $1'];
  let params = [tenantId];
  let paramIndex = 2;

  if (!includeDeleted) {
    whereConditions.push('d.deleted_at IS NULL');
  }

  if (search) {
    whereConditions.push(`(d.title ILIKE $${paramIndex} OR d.lost_reason ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (ownerId) {
    whereConditions.push(`d.owner_id = $${paramIndex}`);
    params.push(ownerId);
    paramIndex++;
  }

  if (pipelineId) {
    whereConditions.push(`d.pipeline_id = $${paramIndex}`);
    params.push(pipelineId);
    paramIndex++;
  }

  if (stageId) {
    whereConditions.push(`d.stage_id = $${paramIndex}`);
    params.push(stageId);
    paramIndex++;
  }

  if (status) {
    whereConditions.push(`d.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (contactId) {
    whereConditions.push(`d.contact_id = $${paramIndex}`);
    params.push(contactId);
    paramIndex++;
  }

  if (companyId) {
    whereConditions.push(`d.company_id = $${paramIndex}`);
    params.push(companyId);
    paramIndex++;
  }

  if (tag) {
    whereConditions.push(`$${paramIndex} = ANY(d.tags)`);
    params.push(tag);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM deals d WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await db.query(
    `SELECT d.*,
            u.name as owner_name, u.email as owner_email,
            c.first_name as contact_first_name, c.last_name as contact_last_name,
            comp.name as company_name,
            p.name as pipeline_name,
            s.name as stage_name, s.probability as stage_probability
     FROM deals d
     JOIN users u ON d.owner_id = u.id
     LEFT JOIN contacts c ON d.contact_id = c.id
     LEFT JOIN companies comp ON d.company_id = comp.id
     LEFT JOIN pipelines p ON d.pipeline_id = p.id
     LEFT JOIN pipeline_stages s ON d.stage_id = s.id
     WHERE ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { deals: dataResult.rows, total };
}

/**
 * Get a single deal by ID.
 */
async function getDealById(tenantId, id, includeDeleted = false) {
  let query = `
    SELECT d.*,
            u.name as owner_name, u.email as owner_email,
            c.first_name as contact_first_name, c.last_name as contact_last_name, c.email as contact_email,
            comp.name as company_name,
            p.name as pipeline_name,
            s.name as stage_name, s.probability as stage_probability
    FROM deals d
    JOIN users u ON d.owner_id = u.id
    LEFT JOIN contacts c ON d.contact_id = c.id
    LEFT JOIN companies comp ON d.company_id = comp.id
    LEFT JOIN pipelines p ON d.pipeline_id = p.id
    LEFT JOIN pipeline_stages s ON d.stage_id = s.id
    WHERE d.id = $1 AND d.tenant_id = $2
  `;
  const params = [id, tenantId];

  if (!includeDeleted) {
    query += ' AND d.deleted_at IS NULL';
  }

  const result = await db.query(query, params);
  return result.rows[0] || null;
}

/**
 * Create a new deal.
 */
async function createDeal(tenantId, { ownerId, title, contactId, companyId, pipelineId, stageId, dealValue, currency, probability, expectedCloseDate, status, lostReason, customProperties, tags }) {
  const result = await db.query(
    `INSERT INTO deals
       (tenant_id, owner_id, title, contact_id, company_id, pipeline_id, stage_id, deal_value, currency, probability, expected_close_date, status, lost_reason, custom_properties, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      tenantId,
      ownerId,
      title,
      contactId,
      companyId,
      pipelineId,
      stageId,
      dealValue || 0,
      currency || 'USD',
      probability || 0,
      expectedCloseDate,
      status || 'open',
      lostReason,
      customProperties ? JSON.stringify(customProperties) : '{}',
      tags || []
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing deal.
 */
async function updateDeal(tenantId, id, updates) {
  const allowedFields = [
    'owner_id', 'title', 'contact_id', 'company_id', 'pipeline_id', 'stage_id',
    'deal_value', 'currency', 'probability', 'expected_close_date', 'status',
    'lost_reason', 'custom_properties', 'tags'
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

  // If status is won or lost, record closed_at
  if (updates.status === 'won' || updates.status === 'lost') {
    setClauses.push('closed_at = NOW()');
  } else if (updates.status === 'open') {
    setClauses.push('closed_at = NULL');
  }

  const result = await db.query(
    `UPDATE deals
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Soft delete a deal.
 */
async function deleteDeal(tenantId, id) {
  const result = await db.query(
    `UPDATE deals
     SET deleted_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * Restore a soft-deleted deal.
 */
async function restoreDeal(tenantId, id) {
  const result = await db.query(
    `UPDATE deals
     SET deleted_at = NULL
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL
     RETURNING *`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = {
  listDeals,
  getDealById,
  createDeal,
  updateDeal,
  deleteDeal,
  restoreDeal
};
