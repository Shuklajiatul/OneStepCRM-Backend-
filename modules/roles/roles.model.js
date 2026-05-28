/**
 * modules/roles/roles.model.js
 * ─────────────────────────────────────────────────────────
 * Data access layer for role profile management.
 */

const db = require('../../config/database');

/**
 * List all role profiles for a tenant.
 */
async function listRoles(tenantId) {
  const result = await db.query(
    `SELECT id, tenant_id, role_name, is_system_role, permissions, created_at, updated_at
     FROM role_profiles
     WHERE tenant_id = $1
     ORDER BY is_system_role DESC, role_name ASC`,
    [tenantId]
  );
  return result.rows;
}

/**
 * Get a single role profile by ID.
 */
async function getRoleById(tenantId, roleId) {
  const result = await db.query(
    `SELECT id, tenant_id, role_name, is_system_role, permissions, created_at, updated_at
     FROM role_profiles
     WHERE id = $1 AND tenant_id = $2`,
    [roleId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new role profile.
 */
async function createRole(tenantId, { roleName, permissions }) {
  const result = await db.query(
    `INSERT INTO role_profiles (tenant_id, role_name, is_system_role, permissions)
     VALUES ($1, $2, false, $3)
     RETURNING *`,
    [tenantId, roleName, JSON.stringify(permissions)]
  );
  return result.rows[0];
}

/**
 * Update a role profile's name and/or permissions.
 */
async function updateRole(tenantId, roleId, { roleName, permissions }) {
  const setClauses = [];
  const params = [tenantId, roleId];
  let paramIndex = 3;

  if (roleName !== undefined) {
    setClauses.push(`role_name = $${paramIndex}`);
    params.push(roleName);
    paramIndex++;
  }

  if (permissions !== undefined) {
    setClauses.push(`permissions = $${paramIndex}`);
    params.push(JSON.stringify(permissions));
    paramIndex++;
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE role_profiles SET ${setClauses.join(', ')}
     WHERE id = $2 AND tenant_id = $1
     RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Delete a role profile.
 */
async function deleteRole(tenantId, roleId) {
  const result = await db.query(
    'DELETE FROM role_profiles WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [roleId, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * Count users assigned to a role.
 */
async function countUsersWithRole(tenantId, roleId) {
  const result = await db.query(
    'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND role_profile_id = $2 AND is_active = true',
    [tenantId, roleId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Get the permissions schema — available modules and actions.
 * Used by frontend to render the permission builder UI.
 */
function getPermissionsSchema() {
  return {
    modules: [
      { key: 'leads',       label: 'Leads',         actions: ['create', 'read', 'update', 'delete'] },
      { key: 'contacts',    label: 'Contacts',      actions: ['create', 'read', 'update', 'delete'] },
      { key: 'companies',   label: 'Companies',     actions: ['create', 'read', 'update', 'delete'] },
      { key: 'deals',       label: 'Deals',         actions: ['create', 'read', 'update', 'delete'] },
      { key: 'activities',  label: 'Activities',    actions: ['create', 'read', 'update', 'delete'] },
      { key: 'pipelines',   label: 'Pipelines',     actions: ['create', 'read', 'update', 'delete'] },
      { key: 'reports',     label: 'Reports',       actions: ['create', 'read', 'update', 'delete'] },
      { key: 'settings',    label: 'Settings',      actions: ['create', 'read', 'update', 'delete'] },
      { key: 'users',       label: 'Users',         actions: ['create', 'read', 'update', 'delete'] },
      { key: 'roles',       label: 'Roles',         actions: ['create', 'read', 'update', 'delete'] },
      { key: 'webhooks',    label: 'Webhooks',      actions: ['create', 'read', 'update', 'delete'] },
      { key: 'customFields',label: 'Custom Fields', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'files',       label: 'Files',         actions: ['create', 'read', 'update', 'delete'] },
    ],
  };
}

module.exports = {
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  countUsersWithRole,
  getPermissionsSchema,
};
