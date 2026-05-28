/**
 * modules/tenant/tenant.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for Tenant organization-level details.
 */

const db = require('../../config/database');
const redis = require('../../config/redis');

/**
 * Get tenant by ID.
 */
async function getTenantById(id) {
  const result = await db.query(
    `SELECT id, company_name, slug, plan, max_users, is_active, settings, created_at, updated_at
     FROM tenants
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update tenant details and settings.
 * Invalidates the Redis cache for this tenant context.
 */
async function updateTenant(id, { companyName, settings }) {
  const setClauses = [];
  const params = [id];
  let paramIndex = 2;

  if (companyName !== undefined) {
    setClauses.push(`company_name = $${paramIndex}`);
    params.push(companyName);
    paramIndex++;
  }

  if (settings !== undefined) {
    setClauses.push(`settings = settings || $${paramIndex}`); // Merge JSONB
    params.push(JSON.stringify(settings));
    paramIndex++;
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE tenants
     SET ${setClauses.join(', ')}
     WHERE id = $1
     RETURNING id, company_name, slug, plan, max_users, is_active, settings, updated_at`,
    params
  );

  // Invalidate cache
  if (result.rows[0]) {
    await redis.del(`tenant:${result.rows[0].slug}`);
  }

  return result.rows[0] || null;
}

module.exports = {
  getTenantById,
  updateTenant
};
