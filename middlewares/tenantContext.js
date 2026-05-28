/**
 * middlewares/tenantContext.js
 * ─────────────────────────────────────────────────────────
 * Extracts and validates the tenant context for every authenticated request.
 * Caches tenant records in Redis with 5 minute TTL.
 */

const db = require('../config/database');
const { getCache, setCache } = require('../config/redis');
const { AuthError } = require('../utils/errors');

const TENANT_CACHE_TTL = 300; // 5 minutes

/**
 * Express middleware: resolve tenant context.
 * Must be used AFTER authenticate middleware.
 *
 * Priority:
 * 1. req.user.tenantId (from JWT — primary path)
 * 2. x-tenant-id header (for internal service calls)
 *
 * Attaches:
 * - req.tenantId (string UUID)
 * - req.tenant (full tenant object)
 */
async function tenantContext(req, res, next) {
  try {
    // Get tenant ID from authenticated user or header
    const tenantId = (req.user && req.user.tenantId) || req.headers['x-tenant-id'];

    if (!tenantId) {
      throw new AuthError('Tenant context is required', 'TENANT_MISSING');
    }

    // Try Redis cache first
    const cacheKey = `tenant:${tenantId}`;
    let tenant = await getCache(cacheKey);

    if (!tenant) {
      // Cache miss — fetch from DB
      const result = await db.query(
        'SELECT id, company_name, slug, plan, max_users, is_active, settings, created_at, updated_at FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        throw new AuthError('Tenant not found', 'TENANT_NOT_FOUND');
      }

      tenant = result.rows[0];

      // Cache the tenant record
      await setCache(cacheKey, tenant, TENANT_CACHE_TTL);
    }

    // Verify tenant is active
    if (!tenant.is_active) {
      throw new AuthError('Tenant account has been deactivated', 'TENANT_INACTIVE');
    }

    // Attach to request
    req.tenantId = tenantId;
    req.tenant = tenant;

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantContext };
