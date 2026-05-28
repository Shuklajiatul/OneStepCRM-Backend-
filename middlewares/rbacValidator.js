/**
 * middlewares/rbacValidator.js
 * ─────────────────────────────────────────────────────────
 * Role-Based Access Control middleware.
 * Checks user permissions from their role profile against required module+action.
 * Caches permissions in Redis with 10 min TTL.
 */

const db = require('../config/database');
const { getCache, setCache, delByPattern } = require('../config/redis');
const { PermissionError } = require('../utils/errors');

const PERM_CACHE_TTL = 600; // 10 minutes

/**
 * Returns an Express middleware function that checks if the current user
 * has permission to perform the given action on the given module.
 *
 * @param {string} module - Module name (e.g., 'leads', 'contacts', 'deals', 'settings')
 * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete')
 * @returns {function} Express middleware
 *
 * @example
 * router.post('/leads', checkPermission('leads', 'create'), leadsController.create);
 */
function checkPermission(module, action) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.roleProfileId) {
        throw new PermissionError('Role information is missing');
      }

      const { tenantId, roleProfileId } = req.user;

      // Try Redis cache first
      const cacheKey = `perm:${tenantId}:${roleProfileId}`;
      let roleProfile = await getCache(cacheKey);

      if (!roleProfile) {
        // Cache miss — fetch from DB
        const result = await db.query(
          'SELECT role_name, is_system_role, permissions FROM role_profiles WHERE id = $1 AND tenant_id = $2',
          [roleProfileId, tenantId]
        );

        if (result.rows.length === 0) {
          throw new PermissionError('Role profile not found');
        }

        roleProfile = result.rows[0];

        // Cache the role profile permissions
        await setCache(cacheKey, roleProfile, PERM_CACHE_TTL);
      }

      // Super admin bypass: Admin system role always has full access
      if (roleProfile.role_name === 'Admin' && roleProfile.is_system_role) {
        return next();
      }

      // Check the permission matrix
      const permissions = roleProfile.permissions || {};
      const modulePerms = permissions[module];

      if (!modulePerms || modulePerms[action] !== true) {
        throw new PermissionError(
          `You do not have permission to ${action} ${module}`
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Invalidate permission cache for all users with a given role profile.
 * Call this when a role's permissions are updated.
 *
 * @param {string} tenantId
 * @param {string} roleProfileId
 */
async function invalidatePermissionCache(tenantId, roleProfileId) {
  await delByPattern(`perm:${tenantId}:${roleProfileId}`);
}

/**
 * Invalidate ALL permission caches for a tenant.
 * Call this on major role restructuring.
 *
 * @param {string} tenantId
 */
async function invalidateAllPermissionCaches(tenantId) {
  await delByPattern(`perm:${tenantId}:*`);
}

module.exports = {
  checkPermission,
  invalidatePermissionCache,
  invalidateAllPermissionCaches,
};
