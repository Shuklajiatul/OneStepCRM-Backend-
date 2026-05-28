/**
 * modules/companies/companies.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Companies.
 */

const db = require('../../config/database');

/**
 * List companies with search, filters, pagination, and tags.
 */
async function listCompanies(tenantId, { limit, offset, search, ownerId, industry, companySize, tag, includeDeleted = false }) {
  let whereConditions = ['c.tenant_id = $1'];
  let params = [tenantId];
  let paramIndex = 2;

  if (!includeDeleted) {
    whereConditions.push('c.deleted_at IS NULL');
  }

  if (search) {
    whereConditions.push(`(c.name ILIKE $${paramIndex} OR c.website ILIKE $${paramIndex} OR c.industry ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (ownerId) {
    whereConditions.push(`c.owner_id = $${paramIndex}`);
    params.push(ownerId);
    paramIndex++;
  }

  if (industry) {
    whereConditions.push(`c.industry = $${paramIndex}`);
    params.push(industry);
    paramIndex++;
  }

  if (companySize) {
    whereConditions.push(`c.company_size = $${paramIndex}`);
    params.push(companySize);
    paramIndex++;
  }

  if (tag) {
    whereConditions.push(`$${paramIndex} = ANY(c.tags)`);
    params.push(tag);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM companies c WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await db.query(
    `SELECT c.*, u.name as owner_name, u.email as owner_email
     FROM companies c
     JOIN users u ON c.owner_id = u.id
     WHERE ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { companies: dataResult.rows, total };
}

/**
 * Get a single company by ID.
 */
async function getCompanyById(tenantId, id, includeDeleted = false) {
  let query = `
    SELECT c.*, u.name as owner_name, u.email as owner_email
    FROM companies c
    JOIN users u ON c.owner_id = u.id
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
 * Create a new company.
 */
async function createCompany(tenantId, { ownerId, name, website, industry, companySize, annualRevenue, employeeCount, billingAddress, shippingAddress, customProperties, tags }) {
  const result = await db.query(
    `INSERT INTO companies
       (tenant_id, owner_id, name, website, industry, company_size, annual_revenue, employee_count, billing_address, shipping_address, custom_properties, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      tenantId,
      ownerId,
      name,
      website,
      industry,
      companySize,
      annualRevenue,
      employeeCount,
      billingAddress ? JSON.stringify(billingAddress) : null,
      shippingAddress ? JSON.stringify(shippingAddress) : null,
      customProperties ? JSON.stringify(customProperties) : '{}',
      tags || []
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing company.
 */
async function updateCompany(tenantId, id, updates) {
  const allowedFields = [
    'owner_id', 'name', 'website', 'industry', 'company_size',
    'annual_revenue', 'employee_count', 'billing_address',
    'shipping_address', 'custom_properties', 'tags'
  ];
  const setClauses = [];
  const params = [tenantId, id];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      if (['billing_address', 'shipping_address', 'custom_properties'].includes(key)) {
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
    `UPDATE companies
     SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Soft delete a company.
 */
async function deleteCompany(tenantId, id) {
  const result = await db.query(
    `UPDATE companies
     SET deleted_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * Restore a soft-deleted company.
 */
async function restoreCompany(tenantId, id) {
  const result = await db.query(
    `UPDATE companies
     SET deleted_at = NULL
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL
     RETURNING *`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = {
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  restoreCompany
};
