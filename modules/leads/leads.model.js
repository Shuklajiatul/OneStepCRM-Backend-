/**
 * modules/leads/leads.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Leads.
 */

const db = require('../../config/database');

/**
 * List leads with search, filters, pagination, and sorting.
 */
async function listLeads(tenantId, { limit, offset, search, ownerId, pipelineStage, priority, tag, includeDeleted = false }) {
  let whereConditions = ['l.tenant_id = $1'];
  let params = [tenantId];
  let paramIndex = 2;

  if (!includeDeleted) {
    whereConditions.push('l.deleted_at IS NULL');
  }

  if (search) {
    whereConditions.push(`(l.title ILIKE $${paramIndex} OR l.first_name ILIKE $${paramIndex} OR l.last_name ILIKE $${paramIndex} OR l.email ILIKE $${paramIndex} OR l.company_name ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (ownerId) {
    whereConditions.push(`l.owner_id = $${paramIndex}`);
    params.push(ownerId);
    paramIndex++;
  }

  if (pipelineStage) {
    whereConditions.push(`l.pipeline_stage = $${paramIndex}`);
    params.push(pipelineStage);
    paramIndex++;
  }

  if (priority) {
    whereConditions.push(`l.priority = $${paramIndex}`);
    params.push(priority);
    paramIndex++;
  }

  if (tag) {
    whereConditions.push(`$${paramIndex} = ANY(l.tags)`);
    params.push(tag);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM leads l WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await db.query(
    `SELECT l.*, u.name as owner_name, u.email as owner_email
     FROM leads l
     JOIN users u ON l.owner_id = u.id
     WHERE ${whereClause}
     ORDER BY l.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { leads: dataResult.rows, total };
}

/**
 * Get lead by ID.
 */
async function getLeadById(tenantId, id, includeDeleted = false) {
  let query = `
    SELECT l.*, u.name as owner_name, u.email as owner_email
    FROM leads l
    JOIN users u ON l.owner_id = u.id
    WHERE l.id = $1 AND l.tenant_id = $2
  `;
  const params = [id, tenantId];

  if (!includeDeleted) {
    query += ' AND l.deleted_at IS NULL';
  }

  const result = await db.query(query, params);
  return result.rows[0] || null;
}

/**
 * Create a new lead.
 */
async function createLead(tenantId, { ownerId, title, firstName, lastName, email, phone, companyName, leadSource, pipelineStage, priority, estimatedValue, expectedCloseDate, customProperties, tags }) {
  const result = await db.query(
    `INSERT INTO leads
       (tenant_id, owner_id, title, first_name, last_name, email, phone, company_name, lead_source, pipeline_stage, priority, estimated_value, expected_close_date, custom_properties, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      tenantId,
      ownerId,
      title,
      firstName,
      lastName,
      email,
      phone,
      companyName,
      leadSource,
      pipelineStage || 'new',
      priority || 'medium',
      estimatedValue,
      expectedCloseDate,
      customProperties ? JSON.stringify(customProperties) : '{}',
      tags || []
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing lead.
 */
async function updateLead(tenantId, id, updates) {
  const allowedFields = [
    'owner_id', 'title', 'first_name', 'last_name', 'email', 'phone',
    'company_name', 'lead_source', 'pipeline_stage', 'priority',
    'estimated_value', 'expected_close_date', 'custom_properties', 'tags'
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
    `UPDATE leads
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Soft delete a lead.
 */
async function deleteLead(tenantId, id) {
  const result = await db.query(
    `UPDATE leads
     SET deleted_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * Restore a soft-deleted lead.
 */
async function restoreLead(tenantId, id) {
  const result = await db.query(
    `UPDATE leads
     SET deleted_at = NULL
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL
     RETURNING *`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Convert a Lead to Contact, Company, and optional Deal (Runs in SQL Transaction).
 */
async function convertLead(tenantId, leadId, userId, { createDeal = false, dealName = null, dealStageId = null, dealPipelineId = null }) {
  return db.transaction(async (client) => {
    // 1. Get Lead
    const leadResult = await client.query(
      `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_converted = false`,
      [leadId, tenantId]
    );
    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found or already converted');
    }
    const lead = leadResult.rows[0];

    // 2. Create Company if company_name exists
    let companyId = null;
    if (lead.company_name) {
      const companyResult = await client.query(
        `INSERT INTO companies (tenant_id, owner_id, name, custom_properties, tags)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [tenantId, lead.owner_id, lead.company_name, '{}', lead.tags]
      );
      companyId = companyResult.rows[0].id;
    }

    // 3. Create Contact
    const contactResult = await client.query(
      `INSERT INTO contacts (tenant_id, owner_id, first_name, last_name, email, phone, company_id, lead_id, lifecycle_stage, custom_properties, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'lead', $9, $10)
       RETURNING *`,
      [
        tenantId,
        lead.owner_id,
        lead.first_name || 'Lead',
        lead.last_name || 'Contact',
        lead.email,
        lead.phone,
        companyId,
        leadId,
        '{}',
        lead.tags
      ]
    );
    const contact = contactResult.rows[0];

    // 4. Create Deal if requested
    let deal = null;
    if (createDeal) {
      // Find pipeline & stage if not provided
      let pipelineId = dealPipelineId;
      let stageId = dealStageId;

      if (!pipelineId || !stageId) {
        const pipelineResult = await client.query(
          `SELECT id FROM pipelines WHERE tenant_id = $1 AND entity_type = 'deal' AND is_default = true LIMIT 1`,
          [tenantId]
        );
        if (pipelineResult.rows.length > 0) {
          pipelineId = pipelineResult.rows[0].id;
          const stageResult = await client.query(
            `SELECT id FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY order_index ASC LIMIT 1`,
            [pipelineId]
          );
          if (stageResult.rows.length > 0) {
            stageId = stageResult.rows[0].id;
          }
        }
      }

      const dealResult = await client.query(
        `INSERT INTO deals (tenant_id, owner_id, title, deal_value, pipeline_id, stage_id, contact_id, company_id, custom_properties, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          tenantId,
          lead.owner_id,
          dealName || `${lead.company_name || lead.last_name || 'Deal'} Deal`,
          lead.estimated_value || 0,
          pipelineId,
          stageId,
          contact.id,
          companyId,
          '{}',
          lead.tags
        ]
      );
      deal = dealResult.rows[0];
    }

    // 5. Update Lead as converted
    await client.query(
      `UPDATE leads
       SET is_converted = true, converted_at = NOW(), converted_by = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [userId, leadId, tenantId]
    );

    return {
      companyId,
      contact,
      deal
    };
  });
}

module.exports = {
  listLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  restoreLead,
  convertLead
};
